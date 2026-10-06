import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    static get observedAttributes(): string[] {
        return ["active"];
    }

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.syncCurrentPage();
    }

    attributeChangedCallback(): void {
        this.syncCurrentPage();
    }

    private syncCurrentPage(): void {
        const link = this.querySelector<HTMLAnchorElement>(":scope > a");
        if (!link) {
            return;
        }
        if (this.hasAttribute("active")) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    }
}
