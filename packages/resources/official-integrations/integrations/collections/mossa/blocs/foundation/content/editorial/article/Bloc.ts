import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private _coverSlot: HTMLSlotElement | null = null;
    private _bylineSlots: HTMLSlotElement[] = [];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._coverSlot = this.shadowRoot?.querySelector('slot[name="cover"]') as HTMLSlotElement | null;
        this._coverSlot?.addEventListener("slotchange", this._syncHasCover);
        this._bylineSlots = Array.from(
            this.shadowRoot?.querySelectorAll(
                'slot[name="author-avatar"], slot[name="author-name"], slot[name="meta"]',
            ) ?? [],
        );
        this._bylineSlots.forEach((slot) => slot.addEventListener("slotchange", this._syncHasByline));
        this._syncHasCover();
        this._syncHasByline();
    }

    disconnectedCallback(): void {
        this._coverSlot?.removeEventListener("slotchange", this._syncHasCover);
        this._bylineSlots.forEach((slot) => slot.removeEventListener("slotchange", this._syncHasByline));
    }

    private _syncHasCover = () => {
        const has = !!this._coverSlot?.assignedElements().length;
        this.toggleAttribute("has-cover", has);
    };

    private _syncHasByline = () => {
        const has = this._bylineSlots.some((slot) =>
            slot
                .assignedNodes({ flatten: true })
                .some((node) => node.nodeType !== Node.TEXT_NODE || !!node.textContent?.trim()),
        );
        this.toggleAttribute("has-byline", has);
    };
}
