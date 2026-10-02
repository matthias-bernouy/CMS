import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    static observedAttributes = ["href"];

    constructor() {
        super({ css, template: template as string });
    }

    connectedCallback(): void {
        this.syncDestination();
    }

    attributeChangedCallback(): void {
        this.syncDestination();
    }

    private syncDestination(): void {
        const anchor = this.querySelector<HTMLAnchorElement>("[data-ulvia-control]");
        if (!anchor) {
            return;
        }
        anchor.setAttribute("href", safeDestination(this.getAttribute("href")));
    }
}

function safeDestination(value: string | null): string {
    const destination = value?.trim() || "#";
    if (/^(?:[/#?]|\.\.?\/)/u.test(destination)) {
        return destination;
    }
    try {
        const url = new URL(destination, document.baseURI);
        return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? destination : "#";
    } catch {
        return "#";
    }
}
