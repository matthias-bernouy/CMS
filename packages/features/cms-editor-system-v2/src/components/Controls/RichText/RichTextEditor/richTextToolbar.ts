import type { TextCapability } from "@bernouy/cms-content/editor";
import { richTextActionIcon, type RichTextAction, richTextActions, richTextActionTitle } from "./richTextActions";

export function renderRichTextToolbar(
    toolbar: HTMLElement,
    capability: TextCapability,
    handlers: {
        action: (action: RichTextAction) => void;
        textSize: (direction: "decrease" | "increase") => void;
    },
): void {
    toolbar.replaceChildren();
    if (capability.size) {
        toolbar.append(
            renderSizeButton("decrease", handlers.textSize),
            renderSizeButton("increase", handlers.textSize),
        );
    }

    for (const action of richTextActions(capability)) {
        const button = document.createElement("button");
        button.className = "tool";
        button.type = "button";
        button.innerHTML = richTextActionIcon(action);
        button.title = richTextActionTitle(action);
        bindToolButton(button, () => handlers.action(action));
        toolbar.append(button);
    }
}

function renderSizeButton(
    direction: "decrease" | "increase",
    onSelect: (direction: "decrease" | "increase") => void,
): HTMLElement {
    const button = document.createElement("button");
    button.className = "tool size-tool";
    button.type = "button";
    button.title = direction === "increase" ? "Increase text size" : "Decrease text size";
    button.textContent = direction === "increase" ? "+" : "-";
    bindToolButton(button, () => onSelect(direction));
    return button;
}

function bindToolButton(button: HTMLButtonElement, onSelect: () => void): void {
    button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
    });
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
}
