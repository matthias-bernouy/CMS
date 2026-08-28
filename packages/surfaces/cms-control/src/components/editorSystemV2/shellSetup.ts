import { Shell, type EditorDataSource } from "@bernouy/cms-editor-system-v2";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import { loadEditorCatalog } from "./catalog";
import type { EditorSettingsResponse } from "./editorResources";
import { currentPageIdentifier } from "./resource";

export async function configureShellCatalogAndFrame(shell: Shell, options: { frame?: boolean } = {}): Promise<void> {
    const [catalog, dataSources, settings] = await Promise.all([
        loadEditorCatalog(),
        fetchJson<EditorDataSource[]>("editor/sources", []),
        fetchJson<EditorSettingsResponse>("system/settings", {}),
    ]);

    shell.setCatalog(catalog);
    shell.setDataSources(dataSources);
    setThemeTokens(shell, settings);

    if (options.frame === false) {
        return;
    }

    const documentId = currentPageIdentifier();
    const frameUrl = documentId
        ? `${getMetaBasePath()}/api/editor/frame?id=${encodeURIComponent(documentId)}`
        : `${getMetaBasePath()}/api/editor/frame`;
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

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
    try {
        const response = await fetch(`${getMetaBasePath()}/api/${path}`);
        return response.ok ? ((await response.json()) as T) : fallback;
    } catch (error) {
        console.error("[editor] failed to load picker source", path, error);
        return fallback;
    }
}
