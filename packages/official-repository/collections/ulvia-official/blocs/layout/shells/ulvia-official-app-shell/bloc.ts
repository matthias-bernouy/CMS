import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private footer: HTMLElement | null = null;
    private footerSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.footer = this.shadowRoot?.querySelector('[part="footer"]') ?? null;
        this.footerSlot = this.shadowRoot?.querySelector('slot[name="footer"]') ?? null;
        this.footerSlot?.addEventListener("slotchange", this.syncFooter);
        this.syncFooter();
    }

    disconnectedCallback(): void {
        this.footerSlot?.removeEventListener("slotchange", this.syncFooter);
    }

    private syncFooter = (): void => {
        const hasContent = this.footerSlot?.assignedNodes({ flatten: true }).some((node) => {
            return node instanceof Element || node.textContent?.trim();
        });
        if (this.footer) {
            this.footer.hidden = !hasContent;
        }
    };
}
