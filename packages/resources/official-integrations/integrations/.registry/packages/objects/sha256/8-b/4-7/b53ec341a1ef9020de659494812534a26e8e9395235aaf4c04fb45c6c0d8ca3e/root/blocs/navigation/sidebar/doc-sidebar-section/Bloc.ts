import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    button = null;
    section = null;

    constructor() {
        super({ css, template });
        this.button = this.shadowRoot?.querySelector(".title") ?? null;
        this.section = this.shadowRoot?.querySelector(".sec") ?? null;
    }

    connectedCallback() {
        this.button?.addEventListener("click", this.onToggle);
    }

    disconnectedCallback() {
        this.button?.removeEventListener("click", this.onToggle);
    }

    onToggle = () => {
        const collapsed = !this.section?.classList.contains("collapsed");
        this.section?.classList.toggle("collapsed", collapsed);
        this.button?.setAttribute("aria-expanded", String(!collapsed));
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
