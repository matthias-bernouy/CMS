import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private observer?: AbortController;

    constructor() {
        super({ css, template: template as string });
    }

    connectedCallback() {
        const details = this.querySelector("details");
        if (!details) {
            return;
        }
        this.observer = new AbortController();
        const update = () => this.setAttribute("aria-expanded", String(details.open));
        details.addEventListener("toggle", update, { signal: this.observer.signal });
        update();
    }

    disconnectedCallback() {
        this.observer?.abort();
    }
}
