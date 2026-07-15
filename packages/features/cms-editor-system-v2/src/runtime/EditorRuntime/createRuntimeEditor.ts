import type { EditorCatalogEntry } from "@bernouy/cms-content/editor";
import type { EditorRegistry } from "../EditorRegistry/EditorRegistry";
import { createRuntimeEditorClass } from "../RuntimeEditor/createRuntimeEditorClass";
import type { RuntimeManagedEditor } from "./types";

export function createRuntimeEditor(
    entry: EditorCatalogEntry,
    target: HTMLElement,
    registry: EditorRegistry,
): RuntimeManagedEditor {
    const RuntimeEditorClass = createRuntimeEditorClass(entry.editor);
    const editor = new RuntimeEditorClass(target, registry) as RuntimeEditorClassInstance;
    editor.catalogEntry = entry;
    registry.register(editor);
    return editor;
}

type RuntimeEditorClassInstance = RuntimeManagedEditor & {
    catalogEntry: EditorCatalogEntry;
};
