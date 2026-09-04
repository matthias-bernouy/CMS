import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["href", "target"];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._syncLink();
    }

    attributeChangedCallback() {
        this._syncLink();
    }

    private _syncLink() {
        const a = this.shadowRoot?.querySelector("a.chip-link") as HTMLAnchorElement | null;
        if (!a) {
            return;
        }
        const href = this.getAttribute("href");
        const target = this.getAttribute("target");
        if (href) {
            a.setAttribute("href", href);
        } else {
            a.removeAttribute("href");
        }
        if (target && target !== "_self") {
            a.setAttribute("target", target);
        } else {
            a.removeAttribute("target");
        }
        if (target === "_blank") {
            a.setAttribute("rel", "noopener noreferrer");
        } else {
            a.removeAttribute("rel");
        }
    }
}
