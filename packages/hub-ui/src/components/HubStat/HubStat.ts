import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };

/**
 * `<hub-stat label="…" sub="…" href="…">value</hub-stat>` — dashboard tile.
 * The big value is the default slot (so it can be interpolated by w13c-fetch).
 */
export class HubStat extends Component {
    static get observedAttributes() { return ["label", "sub", "href"]; }

    constructor() {
        super({
            css: css as unknown as string,
            template: `
                <a part="tile">
                    <span class="label"></span>
                    <span class="value"><slot></slot></span>
                    <span class="sub"></span>
                </a>`,
        });
    }

    override connectedCallback() { this._sync(); }
    attributeChangedCallback() { this._sync(); }

    private _sync() {
        const sr = this.shadowRoot;
        if (!sr) return;
        const a = sr.querySelector("a") as HTMLAnchorElement;
        const href = this.getAttribute("href");
        if (href) a.setAttribute("href", href); else a.removeAttribute("href");
        (sr.querySelector(".label") as HTMLElement).textContent = this.getAttribute("label") ?? "";
        const sub = sr.querySelector(".sub") as HTMLElement;
        sub.textContent = this.getAttribute("sub") ?? "";
        sub.hidden = !this.getAttribute("sub");
    }
}

if (!customElements.get("hub-stat")) customElements.define("hub-stat", HubStat);
