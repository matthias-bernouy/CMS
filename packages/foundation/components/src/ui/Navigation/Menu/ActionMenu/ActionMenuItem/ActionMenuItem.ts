import { Component, upgradeProperty } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class ActionMenuItem extends Component {
    private _control: HTMLButtonElement | HTMLAnchorElement | null;
    private _iconSlot: HTMLSlotElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._control = this.shadowRoot?.querySelector(".item") ?? null;
        this._iconSlot = this.shadowRoot?.querySelector('slot[name="icon"]') ?? null;
    }

    static get observedAttributes(): string[] {
        return ["disabled", "color", "href", "target"];
    }

    override connectedCallback(): void {
        for (const prop of ["disabled", "color", "href", "target"]) {
            upgradeProperty(this, prop);
        }
        this._iconSlot?.addEventListener("slotchange", this._syncIcon);
        this.addEventListener("click", this._preventDisabledNavigation);
        this.sync();
    }

    disconnectedCallback(): void {
        this._iconSlot?.removeEventListener("slotchange", this._syncIcon);
        this.removeEventListener("click", this._preventDisabledNavigation);
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    get disabled(): boolean {
        return this.hasAttribute("disabled");
    }
    set disabled(value: boolean) {
        value ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }

    private sync(): void {
        this.syncControlType();
        if (this._control instanceof HTMLButtonElement) {
            this._control.disabled = this.disabled;
        } else if (this._control) {
            const href = this.getAttribute("href");
            const target = this.getAttribute("target");
            href ? this._control.setAttribute("href", href) : this._control.removeAttribute("href");
            target ? this._control.setAttribute("target", target) : this._control.removeAttribute("target");
            this._control.toggleAttribute("aria-disabled", this.disabled);
            this._control.tabIndex = this.disabled ? -1 : 0;
            if (target === "_blank") {
                this._control.setAttribute("rel", "noopener noreferrer");
            } else {
                this._control.removeAttribute("rel");
            }
        }
        this._syncIcon();
    }

    private syncControlType(): void {
        if (!this._control) {
            return;
        }
        const needsLink = this.hasAttribute("href");
        if (needsLink === this._control instanceof HTMLAnchorElement) {
            return;
        }
        const control = document.createElement(needsLink ? "a" : "button");
        control.className = "item";
        control.setAttribute("role", "menuitem");
        control.setAttribute("part", "item");
        if (control instanceof HTMLButtonElement) {
            control.type = "button";
        }
        while (this._control.firstChild) {
            control.appendChild(this._control.firstChild);
        }
        this._control.replaceWith(control);
        this._control = control;
    }

    private _syncIcon = (): void => {
        this.toggleAttribute("has-icon", Boolean(this._iconSlot?.assignedElements().length));
    };

    private _preventDisabledNavigation = (event: Event): void => {
        if (this.disabled) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    };
}
