import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private _eyebrowSlot: HTMLSlotElement | null = null;
    private _actionSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._eyebrowSlot = this.shadowRoot!.querySelector('slot[name="eyebrow"]') as HTMLSlotElement;
        this._actionSlot = this.shadowRoot!.querySelector('slot[name="action"]') as HTMLSlotElement;
        this._eyebrowSlot.addEventListener("slotchange", this._syncEyebrow);
        this._actionSlot.addEventListener("slotchange", this._syncAction);
        this._syncEyebrow();
        this._syncAction();
    }

    disconnectedCallback(): void {
        this._eyebrowSlot?.removeEventListener("slotchange", this._syncEyebrow);
        this._actionSlot?.removeEventListener("slotchange", this._syncAction);
    }

    private _syncEyebrow = () => {
        this.toggleAttribute("has-eyebrow", (this._eyebrowSlot?.assignedNodes().length ?? 0) > 0);
    };

    private _syncAction = () => {
        this.toggleAttribute("has-action", (this._actionSlot?.assignedElements().length ?? 0) > 0);
    };
}
