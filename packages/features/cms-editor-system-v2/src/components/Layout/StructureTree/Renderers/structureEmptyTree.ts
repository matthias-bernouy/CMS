export type EmptyStructureTreeContext = {
    openRootPicker(): void;
};

export function renderEmptyStructureTree(context: EmptyStructureTreeContext): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "empty";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Add block";
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        context.openRootPicker();
    });
    empty.append("No editable elements", button);
    return empty;
}
