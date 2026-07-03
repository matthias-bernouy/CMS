import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class DashboardWSection extends Component {
    private heading: HTMLElement | null;
    private description: HTMLElement | null;
    private actionsSlot: HTMLSlotElement | null;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        this.heading = this.shadowRoot?.querySelector("[data-heading]") ?? null;
        this.description = this.shadowRoot?.querySelector("[data-description]") ?? null;
        this.actionsSlot = this.shadowRoot?.querySelector('slot[name="actions"]') ?? null;
    }

    static get observedAttributes(): string[] { return ["heading", "description"]; }

    override connectedCallback(): void {
        this.actionsSlot?.addEventListener("slotchange", this.sync);
        this.sync();
    }

    disconnectedCallback(): void {
        this.actionsSlot?.removeEventListener("slotchange", this.sync);
    }

    attributeChangedCallback(): void { this.sync(); }

    private sync = (): void => {
        const heading = this.getAttribute("heading") ?? "";
        const description = this.getAttribute("description") ?? "";
        if (this.heading) this.heading.textContent = heading;
        if (this.description) this.description.textContent = description;
        this.toggleAttribute("has-heading", heading.trim() !== "");
        this.toggleAttribute("has-description", description.trim() !== "");
        this.toggleAttribute("has-actions", hasAssignedContent(this.actionsSlot));
    };
}

if (!customElements.get("cms-dashboard-w-section")) customElements.define("cms-dashboard-w-section", DashboardWSection);

function hasAssignedContent(slot: HTMLSlotElement | null): boolean {
    return Boolean(slot?.assignedNodes({ flatten: true }).some(node => {
        if (node.nodeType !== Node.TEXT_NODE) return true;
        return node.textContent?.trim() !== "";
    }));
}
