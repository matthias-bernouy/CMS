import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["auto-active"];

    constructor() {
        super({ css, template });
        this._observer = new MutationObserver(this._syncActive);
    }

    connectedCallback() {
        this._observer.observe(this, { attributes: true, attributeFilter: ["href"], subtree: true });
        this._syncActive();
        window.addEventListener("popstate", this._syncActive);
    }

    disconnectedCallback() {
        this._observer.disconnect();
        window.removeEventListener("popstate", this._syncActive);
    }

    attributeChangedCallback() {
        this._syncActive();
    }

    _syncActive = () => {
        const anchor = this.querySelector(":scope > a[href]");
        if (!anchor || this.getAttribute("auto-active") === "false") {
            this.removeAttribute("active");
            anchor?.removeAttribute("aria-current");
            return;
        }
        try {
            const active = new URL(anchor.href, window.location.href).pathname === window.location.pathname;
            this.toggleAttribute("active", active);
            if (active) {
                anchor.setAttribute("aria-current", "page");
            } else {
                anchor.removeAttribute("aria-current");
            }
        } catch {
            this.removeAttribute("active");
            anchor.removeAttribute("aria-current");
        }
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
