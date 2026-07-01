import {
    EDITOR_V2_DELETE_DOCUMENT_EVENT,
    EDITOR_V2_SAVE_DOCUMENT_EVENT,
    Shell,
    type BlockPickerItem,
    type EditorDataSource,
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
const deleteDocumentListener: EventListener = (event) => {
    void onDeleteDocument(event);
};

type PageConfigDetailResponse = {
    id: string;
    title: string;
    description: string;
    path: string;
    tags: string[];
    published: boolean;
    defaultTemplateCategory?: string;
};

type EditorSettingsResponse = {
    editor?: {
        layoutCategory?: string;
    };
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

type EditorResource = "page" | "template";

function currentPageIdentifier(): string | null {
    return new URL(window.location.href).searchParams.get("id");
}

function shellResource(shell: Shell): EditorResource {
    const resource = shell.getAttribute("resource");
    if (resource === "template") return resource;
    return "page";
}

function configureShell(shell: Element): void {
    if (!(shell instanceof Shell)) return;
    if (configuredShells.has(shell)) return;

    configuredShells.add(shell);
    shell.addEventListener(EDITOR_V2_SAVE_DOCUMENT_EVENT, saveDocumentListener);
    shell.addEventListener(EDITOR_V2_DELETE_DOCUMENT_EVENT, deleteDocumentListener);

    void configureShellCatalogAndFrame(shell);
    if (currentPageIdentifier()) void loadDocumentConfig(shell, shellResource(shell), currentPageIdentifier()!);
}

async function configureShellCatalogAndFrame(shell: Shell): Promise<void> {
    const [catalog, insertItems, dataSources, settings] = await Promise.all([
        loadEditorCatalog(),
        loadInsertItems(),
        loadDataSources(),
        loadEditorSettings(),
    ]);

    shell.setCatalog(catalog);
    shell.setInsertItems(insertItems);
    shell.setDataSources(dataSources);
    shell.setDefaultTemplateSelection({
        category: settings.editor?.layoutCategory || undefined,
    });

    const documentId = currentPageIdentifier();
    const resource = shellResource(shell);
    const frameUrl = documentId
        ? `${getMetaBasePath()}/api/editor/frame?type=${resource}&id=${encodeURIComponent(documentId)}`
        : `${getMetaBasePath()}/api/editor/frame?type=${resource}`;

    shell.shadowRoot
        ?.querySelector("cms-editor-v2-canvas")
        ?.setAttribute("frame-url", frameUrl);
}

async function loadInsertItems(): Promise<BlockPickerItem[]> {
    return loadTemplateItems();
}

async function loadDataSources(): Promise<EditorDataSource[]> {
    return fetchJson<EditorDataSource[]>("editor/sources", []);
}

async function loadEditorSettings(): Promise<EditorSettingsResponse> {
    return fetchJson<EditorSettingsResponse>("system/settings", {});
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

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
    try {
        const response = await fetch(`${getMetaBasePath()}/api/${path}`);
        if (!response.ok) return fallback;
        return await response.json() as T;
    } catch (error) {
        console.error("[editor] failed to load picker source", path, error);
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
        console.error("[editor] editor catalog script failed", error);
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
        registerEditor(entry: EditorCatalogRegistration): void {
            try {
                entries.push(createEditorCatalogEntry(entry, {
                    tag:         entry.tag ?? "unknown-bloc",
                    label:       entry.label ?? entry.tag ?? "Unknown bloc",
                    description: entry.description,
                    category:    entry.category,
                    defaultContent: entry.defaultContent,
                    bloc:        entry.bloc,
                }));
            } catch (error) {
                console.error("[editor] invalid editor catalog entry", entry, error);
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
        const existing = document.querySelector<HTMLScriptElement>(`script[data-editor-catalog-script="${src}"]`);
        if (existing) {
            resolve();
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.editorCatalogScript = src;
        script.addEventListener("load", () => resolve(), { once: true });
        script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        document.head.append(script);
    });
}

async function loadDocumentConfig(shell: Shell, resource: EditorResource, id: string): Promise<void> {
    if (resource !== "page") {
        await loadReusableConfig(shell, resource, id);
        return;
    }

    await loadPageConfig(shell, id);
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
        defaultTemplateCategory: page.defaultTemplateCategory,
    });
}

async function loadReusableConfig(shell: Shell, resource: "template", id: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/${resource}?id=${encodeURIComponent(id)}`);
    if (response.redirected) {
        window.location.href = response.url;
        return;
    }
    if (!response.ok) {
        shell.setSaveStatus(`${resourceLabel(resource)} load failed`);
        return;
    }

    const detail = await response.json() as TemplateDetail;
    shell.setPageConfig({
        id:          detail.id,
        title:       detail.name,
        path:        detail.identifier,
        description: detail.description ?? "",
        tags:        detail.category ? [detail.category] : [],
        published:   true,
    });
}

async function onSaveDocument(event: CustomEvent<EditorV2SaveDocumentDetail>): Promise<void> {
    const shell = event.currentTarget;
    if (!(shell instanceof Shell)) return;

    try {
        await saveDocument(shellResource(shell), event.detail.page, event.detail.content);
        shell.setSaveStatus("Saved");
    } catch (error) {
        console.error("[editor] save failed", error);
        shell.setSaveStatus("Save failed");
    }
}

async function onDeleteDocument(event: Event): Promise<void> {
    const shell = event.currentTarget;
    if (!(shell instanceof Shell)) return;

    const resource = shellResource(shell);
    const id = currentPageIdentifier();
    if (!id) {
        shell.setSaveStatus(`${resourceLabel(resource)} delete failed`);
        return;
    }

    if (!window.confirm(`Delete this ${resource}? This cannot be undone.`)) return;

    try {
        await deleteDocument(resource, id);
        window.location.href = listUrl(resource);
    } catch (error) {
        console.error("[editor] delete failed", error);
        shell.setSaveStatus(`${resourceLabel(resource)} delete failed`);
    }
}

async function saveDocument(resource: EditorResource, page: EditorV2PageConfig, content: string): Promise<void> {
    if (resource === "page") {
        await savePage(page, content);
        return;
    }

    await saveReusable(resource, page, content);
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

async function saveReusable(resource: "template", page: EditorV2PageConfig, content: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/${resource}`, {
        method:  "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            id:          page.id,
            name:        page.title,
            category:    page.tags[0] ?? "",
            description: page.description,
            content,
        }),
    });

    if (!response.ok) {
        throw new Error(`${resourceLabel(resource)} save failed with ${response.status}`);
    }
}

async function deleteDocument(resource: EditorResource, id: string): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/${resource}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
    });

    if (!response.ok) {
        throw new Error(`${resourceLabel(resource)} delete failed with ${response.status}`);
    }
}

function listUrl(resource: EditorResource): string {
    return `${getMetaBasePath()}/admin/${resource === "page" ? "pages" : `${resource}s`}`;
}

function resourceLabel(resource: EditorResource): string {
    return resource[0]!.toUpperCase() + resource.slice(1);
}

function configureExistingShells(): void {
    document
        .querySelectorAll("cms-editor-shell")
        .forEach(configureShell);
}

function configureAddedShells(node: Node): void {
    if (!(node instanceof Element)) return;

    if (node.matches("cms-editor-shell")) {
        configureShell(node);
    }

    node
        .querySelectorAll("cms-editor-shell")
        .forEach(configureShell);
}

customElements.whenDefined("cms-editor-shell").then(() => {
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
