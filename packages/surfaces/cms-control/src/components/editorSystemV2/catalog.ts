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

export async function loadEditorCatalog(): Promise<EditorCatalog> {
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
    return mergeEditorCatalogs(createControlEditorCatalog(), runtime.getCatalog());
}

function installEditorCatalogRuntime(): EditorCatalogRuntime {
    const entries: EditorCatalog = [];
    const runtime: EditorCatalogRuntime = {
        Editor,
        registerEditor(entry: EditorCatalogRegistration): void {
            try {
                entries.push(
                    createEditorCatalogEntry(entry, {
                        tag: entry.tag ?? "unknown-bloc",
                        label: entry.label ?? entry.tag ?? "Unknown bloc",
                        description: entry.description,
                        category: entry.category,
                        defaultContent: entry.defaultContent,
                        bloc: entry.bloc,
                    }),
                );
            } catch (error) {
                console.error("[editor] invalid editor catalog entry", entry, error);
            }
        },
        getCatalog: () => [...entries],
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
