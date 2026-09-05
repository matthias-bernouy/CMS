import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._leadingSlot = this.shadowRoot!.querySelector('slot[name="leading"]') as HTMLSlotElement;
        this._leadingSlot.addEventListener("slotchange", this._onLeadingSlotChange);
        this._onLeadingSlotChange();
    }

    disconnectedCallback(): void {
        this._leadingSlot?.removeEventListener("slotchange", this._onLeadingSlotChange);
    }

    private _leadingSlot: HTMLSlotElement | null = null;

    private _onLeadingSlotChange = () => {
        const has = (this._leadingSlot?.assignedElements().length ?? 0) > 0;
        this.toggleAttribute("has-leading", has);
    };
}
