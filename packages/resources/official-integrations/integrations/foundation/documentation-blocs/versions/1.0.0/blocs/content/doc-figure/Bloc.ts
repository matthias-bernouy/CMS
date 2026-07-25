import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _media = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._media = this.shadowRoot?.querySelector(".media") ?? null;
        this._media?.addEventListener("click", this._onClick);
    }
    disconnectedCallback() {
        this._media?.removeEventListener("click", this._onClick);
    }
    _onClick = () => {
        if (this.getAttribute("zoom") !== "true") {
            return;
        }
        this.toggleAttribute("zoomed");
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
