import { Component } from "@bernouy/components/base";
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
        this.sync();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private sync(): void {
        const control = this.querySelector<HTMLElement>(":scope > a, :scope > button");
        if (!control) {
            return;
        }
        if (this.hasAttribute("active")) {
            control.setAttribute("aria-current", "page");
        } else {
            control.removeAttribute("aria-current");
        }
    }
}
