export function contextMenuButton(
    label: string,
    action: () => void,
    closeContextMenu: () => void,
    variant?: "danger",
    disabled = false,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = variant ? `context-item ${variant}` : "context-item";
    button.type = "button";
    button.disabled = disabled;
    button.textContent = label;
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (button.disabled) {
            return;
        }
        closeContextMenu();
        action();
    });
    return button;
}

export function contextSeparator(): HTMLElement {
    const separator = document.createElement("div");
    separator.className = "context-separator";
    separator.role = "separator";
    return separator;
}

export function contextTitle(label: string): HTMLElement {
    const title = document.createElement("div");
    title.className = "context-title";
    title.textContent = label;
    return title;
}

export function positionContextMenu(menu: HTMLElement, clientX: number, clientY: number): void {
    const margin = 6;
    const menuBounds = menu.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - menuBounds.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - menuBounds.height - margin);

    menu.style.left = `${Math.min(Math.max(clientX, margin), maxLeft)}px`;
    menu.style.top = `${Math.min(Math.max(clientY, margin), maxTop)}px`;
}
