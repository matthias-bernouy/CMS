import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

/**
 * `<cs-panel>` — generic white card with optional title (icon + text)
 * and a free body. Used as a container for forms, summaries, recap
 * blocks and any "block of content on a surface" pattern in the
 * Courtside theme.
 *
 * The title row hides itself when neither the `icon` slot nor the
 * `title` slot has content (rule 12 — :host(:has()) doesn't work, so
 * a JS-driven host attribute mirrors slot presence).
 */
export class Bloc extends Component {
    private _iconSlot: HTMLSlotElement | null = null;
    private _titleSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._iconSlot = root.querySelector('slot[name="icon"]');
        this._titleSlot = root.querySelector('slot[name="title"]');

        this._iconSlot?.addEventListener("slotchange", this._onSlotChange);
        this._titleSlot?.addEventListener("slotchange", this._onSlotChange);
        this._onSlotChange();
    }

    disconnectedCallback(): void {
        this._iconSlot?.removeEventListener("slotchange", this._onSlotChange);
        this._titleSlot?.removeEventListener("slotchange", this._onSlotChange);
    }

    private _onSlotChange = () => {
        const has = this._slotHasContent(this._iconSlot) || this._slotHasContent(this._titleSlot);
        this.toggleAttribute("has-title-content", has);
    };

    private _slotHasContent(slot: HTMLSlotElement | null): boolean {
        if (!slot) {
            return false;
        }
        const nodes = slot.assignedNodes({ flatten: true });
        return nodes.some(
            (n) =>
                n.nodeType === Node.ELEMENT_NODE ||
                (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0),
        );
    }
}
