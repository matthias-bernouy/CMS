import { Component, upgradeProperty } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class ActionMenu extends Component {
    private _trigger: HTMLButtonElement | null;
    private _panel: HTMLElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._trigger = this.shadowRoot?.querySelector("[data-trigger]") ?? null;
        this._panel = this.shadowRoot?.querySelector("[data-panel]") ?? null;
    }

    static get observedAttributes(): string[] {
        return ["label", "open", "disabled"];
    }

    override connectedCallback(): void {
        for (const prop of ["label", "open", "disabled"]) {
            upgradeProperty(this, prop);
        }
        if (!this.hasAttribute("label")) {
            this.setAttribute("label", "Actions");
        }
        this._trigger?.addEventListener("click", this._onTriggerClick);
        this.addEventListener("click", this._onMenuClick);
        document.addEventListener("click", this._onDocumentClick);
        document.addEventListener("keydown", this._onDocumentKeydown);
        this.sync();
    }

    disconnectedCallback(): void {
        this._trigger?.removeEventListener("click", this._onTriggerClick);
        this.removeEventListener("click", this._onMenuClick);
        document.removeEventListener("click", this._onDocumentClick);
        document.removeEventListener("keydown", this._onDocumentKeydown);
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    get open(): boolean {
        return this.hasAttribute("open");
    }
    set open(value: boolean) {
        value ? this.setAttribute("open", "") : this.removeAttribute("open");
    }

    get label(): string {
        return this.getAttribute("label") ?? "Actions";
    }
    set label(value: string) {
        this.setAttribute("label", value);
    }

    private sync(): void {
        if (this._trigger) {
            this._trigger.disabled = this.hasAttribute("disabled");
            this._trigger.setAttribute("aria-expanded", String(this.open));
            this._trigger.querySelector("[data-label]")!.textContent = this.label;
        }
        if (this._panel) {
            this._panel.hidden = !this.open;
        }
    }

    private _onTriggerClick = (event: Event): void => {
        event.stopPropagation();
        if (!this.hasAttribute("disabled")) {
            this.open = !this.open;
        }
    };

    private _onMenuClick = (event: Event): void => {
        const item = event.composedPath().find(isActionMenuItem);
        if (item && !item.hasAttribute("disabled")) {
            this.open = false;
        }
    };

    private _onDocumentClick = (event: MouseEvent): void => {
        if (!this.open || event.composedPath().includes(this)) {
            return;
        }
        this.open = false;
    };

    private _onDocumentKeydown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape" || !this.open) {
            return;
        }
        this.open = false;
        this._trigger?.focus();
    };
}

function isActionMenuItem(target: EventTarget | undefined): target is HTMLElement {
    return target instanceof HTMLElement && target.tagName.toLowerCase() === "p9r-action-menu-item";
}
