import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["href", "auto-active"];
    _anchor = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._anchor = this.shadowRoot?.querySelector("a") ?? null;
        this._syncHref();
        this._syncActive();
    }
    attributeChangedCallback() {
        this._syncHref();
        this._syncActive();
    }
    _syncHref() {
        const href = this.getAttribute("href") ?? "#";
        this._anchor?.setAttribute("href", href);
    }
    _syncActive() {
        if (this.getAttribute("auto-active") === "false") {
            return;
        }
        const href = this.getAttribute("href");
        if (!href) {
            return;
        }
        try {
            const url = new URL(href, window.location.origin);
            if (url.pathname === window.location.pathname) {
                this.setAttribute("active", "");
            } else {
                this.removeAttribute("active");
            }
        } catch {}
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
