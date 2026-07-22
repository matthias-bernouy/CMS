import type { BlockPickerItem } from "../../Pickers/BlockPickerModal/BlockPickerModal";

export type EmptyStructureTreeContext = {
    defaultTemplates: BlockPickerItem[];
    openRootPicker(): void;
    useDefaultTemplate(templates: BlockPickerItem[]): boolean;
};

export function renderEmptyStructureTree(context: EmptyStructureTreeContext): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "empty";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = context.defaultTemplates.length > 0 ? "Use default template" : "Add block";
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (context.useDefaultTemplate(context.defaultTemplates)) {
            return;
        }
        context.openRootPicker();
    });
    empty.append("No editable elements", button);
    return empty;
}
