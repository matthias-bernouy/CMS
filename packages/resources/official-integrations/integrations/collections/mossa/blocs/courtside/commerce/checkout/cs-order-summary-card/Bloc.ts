import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

/**
 * `<cs-order-summary-card>` — product summary card for the checkout
 * recap step. Image on the left, title + price breakdown stacked on
 * the right, total footer in `--bg-base` underneath.
 *
 * `has-badge` host attr mirrors slot presence (rule 12 — :host(:has)
 * doesn't work in Chromium) so the absolute-positioned badge frame
 * collapses when no badge is slotted.
 */
export class Bloc extends Component {
    private _badgeSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._badgeSlot = this.shadowRoot!.querySelector('slot[name="badge"]');
        this._badgeSlot?.addEventListener("slotchange", this._onBadgeSlotChange);
        this._onBadgeSlotChange();
    }

    disconnectedCallback(): void {
        this._badgeSlot?.removeEventListener("slotchange", this._onBadgeSlotChange);
    }

    private _onBadgeSlotChange = () => {
        const has = (this._badgeSlot?.assignedElements({ flatten: true }) ?? []).length > 0;
        this.toggleAttribute("has-badge", has);
    };
}
