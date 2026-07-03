import { Component, upgradeProperty } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class ActionMenuItem extends Component {
    private _button: HTMLButtonElement | null;
    private _iconSlot: HTMLSlotElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._button = this.shadowRoot?.querySelector("button") ?? null;
        this._iconSlot = this.shadowRoot?.querySelector('slot[name="icon"]') ?? null;
    }

    static get observedAttributes(): string[] { return ["disabled", "color"]; }

    override connectedCallback(): void {
        for (const prop of ["disabled", "color"]) upgradeProperty(this, prop);
        this._iconSlot?.addEventListener("slotchange", this._syncIcon);
        this.sync();
    }

    disconnectedCallback(): void {
        this._iconSlot?.removeEventListener("slotchange", this._syncIcon);
    }

    attributeChangedCallback(): void { this.sync(); }

    get disabled(): boolean { return this.hasAttribute("disabled"); }
    set disabled(value: boolean) { value ? this.setAttribute("disabled", "") : this.removeAttribute("disabled"); }

    private sync(): void {
        if (this._button) this._button.disabled = this.disabled;
        this._syncIcon();
    }

    private _syncIcon = (): void => {
        this.toggleAttribute("has-icon", Boolean(this._iconSlot?.assignedElements().length));
    };
}
