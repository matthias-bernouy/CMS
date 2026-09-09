import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private iconSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.iconSlot = this.shadowRoot!.querySelector('slot[name="icon"]') as HTMLSlotElement;
        this.iconSlot.addEventListener("slotchange", this.syncIcon);
        this.syncIcon();
    }

    disconnectedCallback(): void {
        this.iconSlot?.removeEventListener("slotchange", this.syncIcon);
        this.iconSlot = null;
    }

    private readonly syncIcon = (): void => {
        this.toggleAttribute("has-icon", Boolean(this.iconSlot?.assignedNodes().length));
    };
}
