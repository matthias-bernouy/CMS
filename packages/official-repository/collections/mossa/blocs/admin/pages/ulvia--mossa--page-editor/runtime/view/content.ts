import type { EditableContentField, EditablePageDocument } from "../document/index";
import type { EditorCatalogueItem } from "../model";
import { wrapEditorControl } from "./controls";

export function renderContentFields(
    target: HTMLElement,
    documentModel: EditablePageDocument,
    element: HTMLElement,
    item: EditorCatalogueItem | undefined,
    renderedValue: (field: EditableContentField) => string | undefined,
): void {
    target.replaceChildren();
    for (const field of documentModel.contentFields(element, item)) {
        const label = document.createElement("label");
        const caption = document.createElement("span");
        caption.textContent = field.label;
        const textarea = document.createElement("textarea");
        textarea.dataset.contentAddress = field.address;
        textarea.dataset.contentPosition = String(field.position);
        textarea.dataset.contentSlot = field.slot;
        textarea.rows = field.profile === "prose" ? 7 : 3;
        textarea.value = renderedValue(field) ?? field.value;
        label.append(caption, wrapEditorControl(textarea, "textarea"));
        target.append(label);
    }
    target.toggleAttribute("hidden", target.childElementCount === 0);
}
