import type { RichTextBarExtension, Field, PickContext } from "src/control/core/editorSystem/extensions/types";
import type { RichTextBar } from "../RichTextBar";

/** Restores the saved selection, calls `ext.onPick()` to get the text to
 *  insert, then writes it via `execCommand("insertText")` so the platform's
 *  undo stack records it. Closes the popover via the caller's callback. */
export function pickField(self: RichTextBar, ext: RichTextBarExtension, field: Field): string | null {
    self.selection.restore();
    const range = self.selection.range;
    if (!range) return null;
    const ctx: PickContext = {
        selection:  window.getSelection()!,
        range,
        editableEl: (range.startContainer.parentElement ?? range.startContainer) as HTMLElement,
    };
    const text = ext.onPick(field, ctx);
    document.execCommand("insertText", false, text);
    self.selection.save();
    return text;
}
