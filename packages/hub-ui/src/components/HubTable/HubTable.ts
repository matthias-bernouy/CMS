import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };

/**
 * `<hub-table>` — wraps a `p9r-table` (slot-forwarding the `header` row +
 * the body rows stamped by a child `<w13c-fetch>`) and shows the `empty`
 * slot when there is no data row. Replaces the old global
 * `:has(p9r-row:not([slot]))` empty-state CSS with a MutationObserver, so
 * the styling lives here instead of in a global stylesheet.
 */
export class HubTable extends Component {
    private _observer: MutationObserver | null = null;

    constructor() {
        super({
            css: css as unknown as string,
            template: `
                <p9r-table>
                    <slot name="header" slot="header"></slot>
                    <slot></slot>
                </p9r-table>
                <div part="empty"><slot name="empty"></slot></div>`,
        });
    }

    override connectedCallback() {
        this._observer = new MutationObserver(() => this._sync());
        this._observer.observe(this, { childList: true, subtree: true });
        this._sync();
    }

    disconnectedCallback() { this._observer?.disconnect(); }

    private _sync() {
        const rows = this.querySelectorAll("p9r-row:not([slot])").length;
        (this.shadowRoot!.querySelector("[part='empty']") as HTMLElement).hidden = rows > 0;
    }
}

if (!customElements.get("hub-table")) customElements.define("hub-table", HubTable);
