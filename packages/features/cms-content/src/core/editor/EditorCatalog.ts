import type {
    EditorCatalog,
    EditorCatalogEntry,
    EditorCatalogRegistration,
    EditorCatalogRegistrationDefaults,
} from "../../interfaces/Editor";

function fallbackElementConstructor(): CustomElementConstructor {
    const constructor = globalThis.HTMLElement;
    if (!constructor) {
        throw new Error("Cannot create editor catalog entry without HTMLElement.");
    }

    return constructor as CustomElementConstructor;
}

export function createEditorCatalogEntry(
    entry: EditorCatalogRegistration,
    defaults: EditorCatalogRegistrationDefaults,
): EditorCatalogEntry {
    const tag = entry.tag ?? defaults.tag;
    const editor = entry.editor;
    if (!editor) {
        throw new Error(`Editor catalog entry for ${tag} is missing an editor constructor.`);
    }

    return {
        tag,
        label:       entry.label ?? defaults.label,
        description: entry.description ?? defaults.description,
        icon:        entry.icon,
        category:    entry.category ?? defaults.category,
        subCategory: entry.subCategory,
        bloc:        entry.bloc ?? defaults.bloc ?? globalThis.customElements?.get(tag) ?? fallbackElementConstructor(),
        editor,
    };
}

export function mergeEditorCatalogs(...catalogs: EditorCatalog[]): EditorCatalog {
    const byTag = new Map<string, EditorCatalogEntry>();

    for (const catalog of catalogs) {
        for (const entry of catalog) {
            byTag.set(entry.tag.toLowerCase(), entry);
        }
    }

    return [...byTag.values()];
}
