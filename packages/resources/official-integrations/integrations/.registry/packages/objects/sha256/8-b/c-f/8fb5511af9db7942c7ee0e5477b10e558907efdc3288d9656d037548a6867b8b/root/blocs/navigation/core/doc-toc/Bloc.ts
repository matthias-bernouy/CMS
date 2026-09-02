import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _list = null;
    _observer = null;
    _links = new Map();
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._list = this.shadowRoot?.querySelector(".list") ?? null;
        this._build();
    }
    disconnectedCallback() {
        this._observer?.disconnect();
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
        if (!this._list) {
            return;
        }
        const headings = Array.from(document.querySelectorAll(this._levels()));
        this._list.innerHTML = "";
        this._links.clear();
        for (const h of headings) {
            if (!h.id) {
                h.id = (h.textContent ?? "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "");
            }
            const li = document.createElement("li");
            li.className = `lvl-${h.tagName.toLowerCase()}`;
            const a = document.createElement("a");
            a.href = `#${h.id}`;
            a.textContent = h.textContent ?? "";
            li.appendChild(a);
            this._list.appendChild(li);
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
                        this._links.forEach((l) => l.classList.remove("active"));
                        link.classList.add("active");
                    }
                }
            },
            { rootMargin: "-20% 0% -60% 0%" },
        );
        headings.forEach((h) => this._observer?.observe(h));
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
