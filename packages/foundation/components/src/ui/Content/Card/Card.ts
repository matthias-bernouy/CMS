import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

/** A visual container; authored content and bindings remain in its light DOM. */
export class Card extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.slots.forEach((slot) => slot.addEventListener("slotchange", this.syncSlots));
        this.syncSlots();
    }

    disconnectedCallback(): void {
        this.slots.forEach((slot) => slot.removeEventListener("slotchange", this.syncSlots));
    }

    private get slots(): HTMLSlotElement[] {
        return Array.from(this.shadowRoot!.querySelectorAll("slot"));
    }

    private readonly syncSlots = (): void => {
        for (const slot of this.slots) {
            const populated = slot
                .assignedNodes({ flatten: true })
                .some((node) =>
                    node.nodeType === Node.TEXT_NODE
                        ? Boolean(node.textContent?.trim())
                        : node.nodeType === Node.ELEMENT_NODE,
                );
            this.toggleAttribute(`has-${slot.name || "content"}`, populated);
        }
    };
}
