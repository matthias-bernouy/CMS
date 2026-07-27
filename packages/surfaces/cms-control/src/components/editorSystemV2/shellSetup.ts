import { Shell, type BlockPickerItem, type EditorDataSource } from "@bernouy/cms-editor-system-v2";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import { loadEditorCatalog } from "./catalog";
import type { EditorSettingsResponse, TemplateDetail, TemplateListItem } from "./editorResources";
import { currentPageIdentifier, shellResource } from "./resource";

export async function configureShellCatalogAndFrame(shell: Shell, options: { frame?: boolean } = {}): Promise<void> {
    const [catalog, insertItems, dataSources, settings] = await Promise.all([
        loadEditorCatalog(),
        loadTemplateItems(),
        fetchJson<EditorDataSource[]>("editor/sources", []),
        fetchJson<EditorSettingsResponse>("system/settings", {}),
    ]);

    shell.setCatalog(catalog);
    shell.setInsertItems(insertItems);
    shell.setDataSources(dataSources);
    shell.setDefaultTemplateSelection({ category: settings.editor?.layoutCategory || undefined });
    setThemeTokens(shell, settings);

    if (options.frame === false) {
        return;
    }

    const documentId = currentPageIdentifier();
    const resource = shellResource(shell);
    const frameUrl = documentId
        ? `${getMetaBasePath()}/api/editor/frame?type=${resource}&id=${encodeURIComponent(documentId)}`
        : `${getMetaBasePath()}/api/editor/frame?type=${resource}`;
    shell.shadowRoot?.querySelector("cms-editor-v2-canvas")?.setAttribute("frame-url", frameUrl);
}

function setThemeTokens(shell: Shell, settings: EditorSettingsResponse): void {
    const themeTokens = (settings.theme?.sources ?? []).flatMap((source) =>
        source.categories.flatMap((category) =>
            category.tokens
                .filter((token) => token.type === "color")
                .map((token) => ({
                    label: token.label,
                    variable: token.variable,
                    category: `${source.label} · ${category.label}`,
                })),
        ),
    );
    const settingsView = shell.shadowRoot?.querySelector("cms-editor-v2-settings-view") as
        | (HTMLElement & { setThemeTokens(tokens: typeof themeTokens): void })
        | null;
    settingsView?.setThemeTokens(themeTokens);
}

async function loadTemplateItems(): Promise<BlockPickerItem[]> {
    const templates = await fetchJson<TemplateListItem[]>("template/list", []);
    const details = await Promise.all(
        templates.map((template) =>
            fetchJson<TemplateDetail>(`template?id=${encodeURIComponent(template.id)}`, {
                ...template,
                content: "",
            }),
        ),
    );
    return details
        .filter((template) => template.content)
        .map((template) => ({
            kind: "template",
            id: template.id,
            label: template.name,
            description: template.description,
            category: template.category || "Templates",
            icon: "T",
            content: template.content ?? "",
        }));
}

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
    try {
        const response = await fetch(`${getMetaBasePath()}/api/${path}`);
        return response.ok ? ((await response.json()) as T) : fallback;
    } catch (error) {
        console.error("[editor] failed to load picker source", path, error);
        return fallback;
    }
}
