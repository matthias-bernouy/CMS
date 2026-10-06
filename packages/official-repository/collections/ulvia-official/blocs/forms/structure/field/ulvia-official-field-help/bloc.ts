import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

let nextPanelId = 0;

export class Bloc extends Component {
    private trigger: HTMLButtonElement | null = null;
    private panel: HTMLElement | null = null;

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.trigger = this.querySelector<HTMLButtonElement>("button");
        this.panel = this.querySelector<HTMLElement>("ulvia-official-field-help-panel");
        this.prepareTrigger();
        this.trigger?.addEventListener("click", this.togglePanel);
        document.addEventListener("pointerdown", this.closeFromOutside);
        document.addEventListener("keydown", this.closeFromKeyboard);
    }

    disconnectedCallback(): void {
        this.trigger?.removeEventListener("click", this.togglePanel);
        document.removeEventListener("pointerdown", this.closeFromOutside);
        document.removeEventListener("keydown", this.closeFromKeyboard);
    }

    private prepareTrigger(): void {
        if (!this.trigger) {
            return;
        }
        const label = this.trigger.getAttribute("aria-label") || this.trigger.textContent?.trim();
        if (label) {
            this.trigger.setAttribute("aria-label", label);
        }
        if (this.panel) {
            this.panel.id ||= `ulvia-field-help-${++nextPanelId}`;
            this.panel.setAttribute("role", "tooltip");
            this.trigger.setAttribute("aria-controls", this.panel.id);
        }
        this.trigger.textContent = "?";
    }

    private togglePanel = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        this.setOpen(this.panel?.hasAttribute("hidden") === true);
    };

    private closeFromOutside = (event: Event): void => {
        if (event.target instanceof Node && !this.contains(event.target)) {
            this.setOpen(false);
        }
    };

    private closeFromKeyboard = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this.setOpen(false);
            this.trigger?.focus();
        }
    };

    private setOpen(open: boolean): void {
        this.panel?.toggleAttribute("hidden", !open);
        this.trigger?.setAttribute("aria-expanded", String(open));
        if (open && this.panel) {
            this.trigger?.setAttribute("aria-describedby", this.panel.id);
        } else {
            this.trigger?.removeAttribute("aria-describedby");
        }
    }
}
