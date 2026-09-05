import {
    Editor,
    createEditorCatalogEntry,
    isNativeHtmlTag,
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

type BlocCatalogueLifecycle = { tag: string; state: "published" | "draft" | "archived" };
type InsertableCatalogEntry = EditorCatalog[number] & { insertable?: boolean };

let catalogPromise: Promise<InsertableCatalogEntry[]> | null = null;

export async function loadEditorCatalog(): Promise<InsertableCatalogEntry[]> {
    catalogPromise ??= loadEditorCatalogOnce();
    return catalogPromise;
}

async function loadEditorCatalogOnce(): Promise<InsertableCatalogEntry[]> {
    const runtime = installEditorCatalogRuntime();
    try {
        await loadScript(`${getMetaBasePath()}/api/editor/script.js`);
    } catch (error) {
        console.error("[editor] editor catalog script failed", error);
    }
    const catalog = mergeEditorCatalogs(runtime.getCatalog(), createControlEditorCatalog());
    return applyBlocCatalogueInsertionState(catalog, await loadBlocLifecycle());
}

export function applyBlocCatalogueInsertionState(
    catalog: EditorCatalog,
    lifecycle: BlocCatalogueLifecycle[],
): InsertableCatalogEntry[] {
    const archived = new Set(
        lifecycle.filter((item) => item.state === "archived").map((item) => item.tag.toLowerCase()),
    );
    return catalog.map((entry) =>
        archived.has(entry.tag.toLowerCase()) ? { ...entry, insertable: false } : { ...entry },
    );
}

async function loadBlocLifecycle(): Promise<BlocCatalogueLifecycle[]> {
    try {
        const response = await fetch(`${getMetaBasePath()}/api/bloc/catalogue`);
        return response.ok ? ((await response.json()) as BlocCatalogueLifecycle[]) : [];
    } catch (error) {
        console.error("[editor] bloc lifecycle catalogue failed", error);
        return [];
    }
}

export function installEditorCatalogRuntime(): EditorCatalogRuntime {
    const entries: EditorCatalog = [];
    const runtime: EditorCatalogRuntime = {
        Editor,
        registerEditor(entry: EditorCatalogRegistration): void {
            try {
                if (entry.tag && isNativeHtmlTag(entry.tag)) {
                    throw new Error(
                        `Native HTML tag "${entry.tag}" is platform-owned and cannot be registered by an integration.`,
                    );
                }
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
