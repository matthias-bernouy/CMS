import { Component } from "@bernouy/components/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Card extends Component {

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }

    override connectedCallback(): void {
        this._headerSlot.addEventListener("slotchange", this._syncSlots);
        this._footerSlot.addEventListener("slotchange", this._syncSlots);
        this._syncSlots();
    }

    disconnectedCallback(): void {
        this._headerSlot.removeEventListener("slotchange", this._syncSlots);
        this._footerSlot.removeEventListener("slotchange", this._syncSlots);
    }

    private readonly _syncSlots = (): void => {
        this.toggleAttribute("has-header", hasAssignedContent(this._headerSlot));
        this.toggleAttribute("has-footer", hasAssignedContent(this._footerSlot));
    };

    private get _headerSlot(): HTMLSlotElement {
        return this.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="header"]')!;
    }

    private get _footerSlot(): HTMLSlotElement {
        return this.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="footer"]')!;
    }
}

function hasAssignedContent(slot: HTMLSlotElement): boolean {
    return slot.assignedNodes({ flatten: true }).some(node => {
        if (node.nodeType !== Node.TEXT_NODE) return true;
        return node.textContent?.trim() !== "";
    });
}
