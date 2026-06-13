import {
    EDITOR_V2_SAVE_DOCUMENT_EVENT,
    Shell,
    type BlockPickerItem,
    type EditorV2PageConfig,
    type EditorV2SaveDocumentDetail,
} from "@bernouy/cms-editor-system-v2";
import {
    Editor,
    createEditorCatalogEntry,
    mergeEditorCatalogs,
    type EditorCatalog,
    type EditorCatalogRegistration,
    type EditorCatalogRuntime,
} from "@bernouy/cms-content/editor";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import { createControlEditorCatalog } from "cms-control/core/editorSystemV2/editorCatalog";

declare global {
    interface Window {
        p9rEditor?: EditorCatalogRuntime;
    }
}

let catalogPromise: Promise<EditorCatalog> | null = null;

const configuredShells = new WeakSet<Shell>();
const saveDocumentListener: EventListener = (event) => {
    void onSaveDocument(event as CustomEvent<EditorV2SaveDocumentDetail>);
};

type PageConfigDetailResponse = {
    id: string;
    title: string;
    description: string;
    path: string;
    tags: string[];
    published: boolean;
};

type TemplateListItem = {
    id: string;
    identifier: string;
    name: string;
    category: string;
};

type TemplateDetail = TemplateListItem & {
    description?: string;
    content?: string;
};

type SnippetListItem = {
    id: string;
    identifier: string;
    name: string;
    category: string;
};

type SnippetDetail = SnippetListItem & {
    description?: string;
    content?: string;
};

type LegacyEditorCatalogRegistration = EditorCatalogRegistration & {
    cl?: EditorCatalogRegistration["editor"];
    group?: string;
};

function currentPageIdentifier(): string | null {
    return new URL(window.location.href).searchParams.get("id");
}

function configureShell(shell: Element): void {
    if (!(shell instanceof Shell)) return;
    if (configuredShells.has(shell)) return;

    configuredShells.add(shell);
    shell.addEventListener(EDITOR_V2_SAVE_DOCUMENT_EVENT, saveDocumentListener);

    void configureShellCatalogAndFrame(shell);
    if (currentPageIdentifier()) void loadPageConfig(shell, currentPageIdentifier()!);
}

async function configureShellCatalogAndFrame(shell: Shell): Promise<void> {
    const [catalog, insertItems] = await Promise.all([
        loadEditorCatalog(),
        loadInsertItems(),
    ]);

    shell.setCatalog(catalog);
    shell.setInsertItems(insertItems);

    const pageId = currentPageIdentifier();
    const frameUrl = pageId
        ? `${getMetaBasePath()}/api/editor-v2/frame?id=${encodeURIComponent(pageId)}`
        : `${getMetaBasePath()}/api/editor-v2/frame`;

    shell.shadowRoot
        ?.querySelector("cms-editor-v2-canvas")
        ?.setAttribute("frame-url", frameUrl);
}

async function loadInsertItems(): Promise<BlockPickerItem[]> {
    const [templates, snippets] = await Promise.all([
        loadTemplateItems(),
        loadSnippetItems(),
    ]);

    return [
        ...templates,
        ...snippets,
    ];
}

async function loadTemplateItems(): Promise<BlockPickerItem[]> {
    const templates = await fetchJson<TemplateListItem[]>("template/list", []);
    const details = await Promise.all(templates.map(template => fetchJson<TemplateDetail>(`template?id=${encodeURIComponent(template.id)}`, {
        ...template,
        content: "",
    })));

    return details
        .filter(template => template.content)
        .map(template => ({
            kind:        "template",
            id:          template.id,
            label:       template.name,
            description: template.description,
            category:    template.category || "Templates",
            icon:        "T",
            content:     template.content ?? "",
        }));
}

async function loadSnippetItems(): Promise<BlockPickerItem[]> {
    const snippets = await fetchJson<SnippetListItem[]>("snippet/list", []);
    const details = await Promise.all(snippets.map(snippet => fetchJson<SnippetDetail>(`snippet?id=${encodeURIComponent(snippet.id)}`, {
        ...snippet,
        content: "",
    })));

    return details
        .filter(snippet => snippet.identifier)
        .map(snippet => ({
            kind:        "snippet",
            id:          snippet.id,
            identifier:  snippet.identifier,
            label:       snippet.name,
            description: snippet.description,
            category:    snippet.category || "Snippets",
            icon:        "S",
            content:     snippet.content ?? "",
        }));
}

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
    try {
        const response = await fetch(`${getMetaBasePath()}/api/${path}`);
        if (!response.ok) return fallback;
        return await response.json() as T;
    } catch (error) {
        console.error("[editor-v2] failed to load picker source", path, error);
        return fallback;
    }
}

async function loadEditorCatalog(): Promise<EditorCatalog> {
    catalogPromise ??= loadEditorCatalogOnce();
    return catalogPromise;
}

async function loadEditorCatalogOnce(): Promise<EditorCatalog> {
    const runtime = installEditorCatalogRuntime();

    try {
        await loadScript(`${getMetaBasePath()}/api/editor/script.js`);
    } catch (error) {
        console.error("[editor-v2] editor catalog script failed", error);
    }

    return mergeEditorCatalogs(
        createControlEditorCatalog(),
        runtime.getCatalog(),
    );
}

function installEditorCatalogRuntime(): EditorCatalogRuntime {
    const entries: EditorCatalog = [];

    const runtime: EditorCatalogRuntime = {
        Editor,
        registerEditor(entry: LegacyEditorCatalogRegistration): void {
            try {
                const normalizedEntry: EditorCatalogRegistration = {
                    ...entry,
                    editor: entry.editor ?? entry.cl,
                    category: entry.category ?? entry.group,
                };

                entries.push(createEditorCatalogEntry(normalizedEntry, {
                    tag:         entry.tag ?? "unknown-bloc",
                    label:       entry.label ?? entry.tag ?? "Unknown bloc",
                    description: entry.description,
                    category:    entry.category ?? entry.group,
                    bloc:        entry.bloc,
                }));
            } catch (error) {
                console.error("[editor-v2] invalid editor catalog entry", entry, error);
            }
        },
        getCatalog(): EditorCatalog {
            return [...entries];
        },
    };

    window.p9rEditor = runtime;
    return runtime;
}

async function loadScript(src: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[data-editor-v2-catalog-script="${src}"]`);
        if (existing) {
            resolve();
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.editorV2CatalogScript = src;
        script.addEventListener("load", () => resolve(), { once: true });
        script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        document.head.append(script);
    });
}

async function loadPageConfig(shell: Shell, pageId: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/page/configDetail?id=${encodeURIComponent(pageId)}`);
    if (response.redirected) {
        window.location.href = response.url;
        return;
    }
    if (!response.ok) {
        shell.setSaveStatus("Page load failed");
        return;
    }

    const page = await response.json() as PageConfigDetailResponse;
    shell.setPageConfig({
        id:          page.id,
        title:       page.title,
        path:        page.path,
        description: page.description,
        tags:        page.tags,
        published:   page.published,
    });
}

async function onSaveDocument(event: CustomEvent<EditorV2SaveDocumentDetail>): Promise<void> {
    const shell = event.currentTarget;
    if (!(shell instanceof Shell)) return;

    try {
        await savePage(event.detail.page, event.detail.content);
        shell.setSaveStatus("Saved");
    } catch (error) {
        console.error("[editor-v2] save failed", error);
        shell.setSaveStatus("Save failed");
    }
}

async function savePage(page: EditorV2PageConfig, content: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/page`, {
        method:  "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            id:          page.id,
            title:       page.title,
            path:        page.path,
            description: page.description,
            visible:     page.published,
            tags:        page.tags,
            content,
        }),
    });

    if (!response.ok) {
        throw new Error(`Page save failed with ${response.status}`);
    }
}

function configureExistingShells(): void {
    document
        .querySelectorAll("cms-editor-v2-shell")
        .forEach(configureShell);
}

function configureAddedShells(node: Node): void {
    if (!(node instanceof Element)) return;

    if (node.matches("cms-editor-v2-shell")) {
        configureShell(node);
    }

    node
        .querySelectorAll("cms-editor-v2-shell")
        .forEach(configureShell);
}

customElements.whenDefined("cms-editor-v2-shell").then(() => {
    configureExistingShells();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", configureExistingShells, { once: true });
    }

    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(configureAddedShells);
        }
    }).observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
});
