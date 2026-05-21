import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };

/**
 * `<hub-grid>` — auto-fill card grid. Cards (`p9r-card`) are stamped into the
 * default slot by a `<w13c-fetch>`; the empty slot (`slot="empty"`) shows
 * when no card is present. Empty detection is JS (slotchange) — the old
 * global `:has` CSS trick is gone.
 */
export class HubGrid extends Component {
    constructor() {
        super({
            css: css as unknown as string,
            template: `
                <div part="grid"><slot></slot></div>
                <div part="empty"><slot name="empty"></slot></div>`,
        });
    }

    override connectedCallback() {
        const slot = this.shadowRoot!.querySelector("slot:not([name])") as HTMLSlotElement;
        slot.addEventListener("slotchange", () => this._sync(slot));
        this._sync(slot);
    }

    private _sync(slot: HTMLSlotElement) {
        // Count real items (cards / stat tiles), ignoring the <w13c-fetch>
        // host and any leftover <template>.
        const items = slot.assignedElements()
            .filter((el) => el.tagName !== "W13C-FETCH" && el.tagName !== "TEMPLATE").length;
        (this.shadowRoot!.querySelector("[part='empty']") as HTMLElement).hidden = items > 0;
    }
}

if (!customElements.get("hub-grid")) customElements.define("hub-grid", HubGrid);
