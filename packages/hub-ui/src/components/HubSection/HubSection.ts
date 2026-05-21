import { Component } from "../_base/Component";
import css from "./style.css" with { type: "text" };

/** `<hub-section label="…">` — a titled block (h2 + content slot). */
export class HubSection extends Component {
    static get observedAttributes() { return ["label"]; }

    constructor() {
        super({
            css: css as unknown as string,
            template: `<h2 part="title" hidden></h2><div part="body"><slot></slot></div>`,
        });
    }

    override connectedCallback() { this._sync(); }
    attributeChangedCallback() { this._sync(); }

    private _sync() {
        const h2 = this.shadowRoot?.querySelector("[part='title']") as HTMLElement | null;
        if (!h2) return;
        const label = this.getAttribute("label") ?? "";
        h2.textContent = label;
        h2.hidden = label === "";
    }
}

if (!customElements.get("hub-section")) customElements.define("hub-section", HubSection);
