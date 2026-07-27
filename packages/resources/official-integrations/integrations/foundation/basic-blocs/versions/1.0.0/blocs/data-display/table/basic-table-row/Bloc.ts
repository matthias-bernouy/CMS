import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class BasicTableRow extends Component {
    static observedAttributes = ["href"];

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this.addEventListener("click", this.onClick);
        this.addEventListener("keydown", this.onKeydown);
        this.syncAccessibility();
    }

    disconnectedCallback() {
        this.removeEventListener("click", this.onClick);
        this.removeEventListener("keydown", this.onKeydown);
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.syncAccessibility();
        }
    }

    syncAccessibility() {
        if (this.hasAttribute("href")) {
            this.setAttribute("role", "link");
            this.setAttribute("tabindex", "0");
            return;
        }
        this.setAttribute("role", "row");
        this.removeAttribute("tabindex");
    }

    activate() {
        const href = this.getAttribute("href")?.trim();
        if (!href) {
            return;
        }
        const target = this.getAttribute("target");
        const proceed = this.dispatchEvent(
            new CustomEvent("basic-table-row:activate", {
                bubbles: true,
                composed: true,
                cancelable: true,
                detail: { href, target },
            }),
        );
        if (!proceed) {
            return;
        }
        this.navigationAnchor.href = href;
        this.navigationAnchor.target = target || "";
        this.navigationAnchor.rel = target === "_blank" ? "noopener noreferrer" : "";
        this.navigationAnchor.click();
    }

    onClick = (event) => {
        const interactive = event
            .composedPath()
            .some(
                (node) =>
                    node !== this &&
                    node instanceof Element &&
                    node.matches("a, button, input, select, textarea, [role='button'], [role='link']"),
            );
        if (!interactive) {
            this.activate();
        }
    };

    onKeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        event.preventDefault();
        this.activate();
    };

    get navigationAnchor() {
        return this.shadowRoot.querySelector("[data-navigation]");
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicTableRow);
