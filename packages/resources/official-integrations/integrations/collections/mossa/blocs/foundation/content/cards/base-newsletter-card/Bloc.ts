import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private _iconSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._iconSlot = this.shadowRoot!.querySelector('slot[name="icon"]') as HTMLSlotElement;
        this._iconSlot.addEventListener("slotchange", this._syncIcon);
        this._syncIcon();
    }

    disconnectedCallback(): void {
        this._iconSlot?.removeEventListener("slotchange", this._syncIcon);
    }

    private _syncIcon = () => {
        this.toggleAttribute("has-icon", (this._iconSlot?.assignedElements().length ?? 0) > 0);
    };
}
