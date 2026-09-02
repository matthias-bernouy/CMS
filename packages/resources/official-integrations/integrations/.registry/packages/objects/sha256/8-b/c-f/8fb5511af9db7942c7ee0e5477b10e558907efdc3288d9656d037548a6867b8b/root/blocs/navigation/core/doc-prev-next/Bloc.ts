import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["prev-href", "next-href"];
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._sync();
    }
    attributeChangedCallback() {
        this._sync();
    }
    _sync() {
        const prev = this.shadowRoot?.querySelector("a.prev");
        const next = this.shadowRoot?.querySelector("a.next");
        const prevHref = this.getAttribute("prev-href");
        const nextHref = this.getAttribute("next-href");
        if (prev) {
            if (prevHref) {
                prev.setAttribute("href", prevHref);
            } else {
                prev.removeAttribute("href");
            }
        }
        if (next) {
            if (nextHref) {
                next.setAttribute("href", nextHref);
            } else {
                next.removeAttribute("href");
            }
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
