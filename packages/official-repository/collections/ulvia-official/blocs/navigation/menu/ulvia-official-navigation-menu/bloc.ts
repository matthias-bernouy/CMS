import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    static get observedAttributes(): string[] {
        return ["label"];
    }

    constructor() {
        super({ css, template });
        this.syncLabel();
    }

    attributeChangedCallback(): void {
        this.syncLabel();
    }

    private syncLabel(): void {
        this.shadowRoot?.querySelector("nav")?.setAttribute("aria-label", this.getAttribute("label") || "Navigation");
    }
}
