import type { Editor } from "@bernouy/cms-content/editor";

export type StructureKeyboardContext = {
    closeContextMenu(): void;
    emitCopy(editor: Editor): void;
    emitDelete(editor: Editor): void;
    emitPaste(editor?: Editor): void;
    selectedEditor: Editor | null;
};

export function onStructureDocumentKeydown(event: KeyboardEvent, context: StructureKeyboardContext): void {
    if (event.key === "Escape") {
        context.closeContextMenu();
        return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && context.selectedEditor && !isEditableKeyEvent(event)) {
        event.preventDefault();
        context.emitDelete(context.selectedEditor);
        return;
    }

    if (!event.ctrlKey && !event.metaKey) return;
    if (isEditableKeyEvent(event)) return;

    const key = event.key.toLowerCase();
    if (key === "c" && context.selectedEditor) {
        event.preventDefault();
        context.emitCopy(context.selectedEditor);
    } else if (key === "v") {
        event.preventDefault();
        context.emitPaste(context.selectedEditor ?? undefined);
    }
}

export function isEditableKeyEvent(event: Event): boolean {
    return event.composedPath().some(target => {
        if (!(target instanceof Element)) return false;
        return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    });
}
