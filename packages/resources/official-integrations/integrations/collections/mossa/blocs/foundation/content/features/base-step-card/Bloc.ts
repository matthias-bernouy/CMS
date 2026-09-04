import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private _iconSlot: HTMLSlotElement | null = null;
    private _numberSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._iconSlot = this.shadowRoot!.querySelector('slot[name="icon"]') as HTMLSlotElement;
        this._numberSlot = this.shadowRoot!.querySelector('slot[name="number"]') as HTMLSlotElement;
        this._iconSlot.addEventListener("slotchange", this._syncIcon);
        this._numberSlot.addEventListener("slotchange", this._syncNumber);
        this._syncIcon();
        this._syncNumber();
    }

    disconnectedCallback(): void {
        this._iconSlot?.removeEventListener("slotchange", this._syncIcon);
        this._numberSlot?.removeEventListener("slotchange", this._syncNumber);
    }

    private _syncIcon = () => {
        this.toggleAttribute("has-icon", (this._iconSlot?.assignedElements().length ?? 0) > 0);
    };

    private _syncNumber = () => {
        this.toggleAttribute("has-number", (this._numberSlot?.assignedNodes().length ?? 0) > 0);
    };
}
