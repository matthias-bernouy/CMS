import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private _actionsSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._actionsSlot = this.shadowRoot!.querySelector('slot[name="actions"]') as HTMLSlotElement;
        this._actionsSlot.addEventListener("slotchange", this._onActionsSlotChange);
        this._onActionsSlotChange();
    }

    disconnectedCallback(): void {
        this._actionsSlot?.removeEventListener("slotchange", this._onActionsSlotChange);
    }

    private _onActionsSlotChange = () => {
        const has = (this._actionsSlot?.assignedElements().length ?? 0) > 0;
        this.toggleAttribute("has-actions", has);
    };
}
