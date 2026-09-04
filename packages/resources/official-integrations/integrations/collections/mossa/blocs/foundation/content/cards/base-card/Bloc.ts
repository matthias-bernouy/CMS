import { Component, type ComponentMetadata } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

const defaultMetadata: ComponentMetadata = {
    css: css as unknown as string,
    template: template as unknown as string,
};

export class Card extends Component {
    constructor(metadata: ComponentMetadata = defaultMetadata) {
        super(metadata);
    }

    override connectedCallback(): void {
        for (const slot of this.slots) {
            slot.addEventListener("slotchange", this.syncSlots);
        }
        this.syncSlots();
    }

    disconnectedCallback(): void {
        for (const slot of this.slots) {
            slot.removeEventListener("slotchange", this.syncSlots);
        }
    }

    private readonly syncSlots = (): void => {
        for (const slot of this.slots) {
            if (slot.name) {
                this.toggleAttribute(`has-${slot.name}`, hasAssignedContent(slot));
            }
        }
        this.toggleAttribute("has-header", this.regionHasContent("[data-card-header]"));
        this.toggleAttribute("has-footer", this.regionHasContent("[data-card-footer]"));
    };

    private regionHasContent(selector: string): boolean {
        return Array.from(this.shadowRoot!.querySelectorAll<HTMLSlotElement>(`${selector} slot`)).some(
            hasAssignedContent,
        );
    }

    private get slots(): HTMLSlotElement[] {
        return Array.from(this.shadowRoot!.querySelectorAll("slot"));
    }
}

function hasAssignedContent(slot: HTMLSlotElement): boolean {
    return slot
        .assignedNodes({ flatten: true })
        .some((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
}
