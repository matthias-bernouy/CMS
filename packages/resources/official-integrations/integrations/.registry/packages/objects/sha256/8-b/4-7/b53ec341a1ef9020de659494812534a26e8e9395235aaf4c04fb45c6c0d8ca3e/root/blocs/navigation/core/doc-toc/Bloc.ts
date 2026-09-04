import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _observer = null;
    _links = new Map();
    static observedAttributes = ["levels"];
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._build();
    }
    disconnectedCallback() {
        this._observer?.disconnect();
    }
    attributeChangedCallback() {
        if (this.isConnected) {
            this._build();
        }
    }
    _levels() {
        const l = this.getAttribute("levels") ?? "h2-h3";
        if (l === "h2") {
            return "h2";
        }
        if (l === "h2-h4") {
            return "h2, h3, h4";
        }
        return "h2, h3";
    }
    _build() {
        this._observer?.disconnect();
        const headings = Array.from(document.querySelectorAll(this._levels()));
        for (const link of this.querySelectorAll(":scope > a[data-doc-toc-entry]")) {
            link.remove();
        }
        this._links.clear();
        for (const h of headings) {
            if (!h.id) {
                h.id = (h.textContent ?? "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "");
            }
            const a = document.createElement("a");
            a.slot = "entry";
            a.dataset.docTocEntry = "";
            a.dataset.level = h.tagName.toLowerCase();
            a.href = `#${h.id}`;
            a.textContent = h.textContent ?? "";
            this.appendChild(a);
            this._links.set(h.id, a);
        }
        this._observer = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    const link = this._links.get(e.target.id);
                    if (!link) {
                        continue;
                    }
                    if (e.isIntersecting) {
                        this._links.forEach((l) => l.removeAttribute("data-active"));
                        link.setAttribute("data-active", "");
                    }
                }
            },
            { rootMargin: "-20% 0% -60% 0%" },
        );
        headings.forEach((h) => this._observer?.observe(h));
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
