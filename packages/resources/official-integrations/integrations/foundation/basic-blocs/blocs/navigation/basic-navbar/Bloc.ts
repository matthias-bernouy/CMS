import { Component } from "@bernouy/components/base";

import { basicColorSchemeCss } from "./colorSchemes";
import baseCss from "./internals/base.css" with { type: "text" };
import { NavbarLayoutController } from "./internals/layout";
import responsiveCss from "./internals/responsive.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class BasicNavbar extends Component {
    static observedAttributes = ["close-label", "navigation-label", "open", "open-label"];

    constructor() {
        super({ css: `${basicColorSchemeCss("neutral")}\n${baseCss}\n${responsiveCss}`, template });
        this.toggleButton = this.shadowRoot.querySelector("[data-toggle]");
        this.navigation = this.shadowRoot.querySelector("nav");
        this.layout = new NavbarLayoutController({
            host: this,
            bar: this.shadowRoot.querySelector('[part="bar"]'),
            brand: this.shadowRoot.querySelector('[part="brand"]'),
            links: this.shadowRoot.querySelector('[part="links"]'),
            actions: this.shadowRoot.querySelector('[part="actions"]'),
            navigation: this.navigation,
            slots: [...this.shadowRoot.querySelectorAll("slot")],
            onExpanded: () => this.close(),
        });
    }

    connectedCallback() {
        this.toggleButton.addEventListener("click", this.onToggle);
        this.addEventListener("click", this.onLinkClick);
        this.ownerDocument.addEventListener("keydown", this.onDocumentKeyDown);
        this.ownerDocument.addEventListener("pointerdown", this.onDocumentPointerDown);
        this.layout.connect();
        this.sync();
    }

    disconnectedCallback() {
        this.toggleButton.removeEventListener("click", this.onToggle);
        this.removeEventListener("click", this.onLinkClick);
        this.ownerDocument.removeEventListener("keydown", this.onDocumentKeyDown);
        this.ownerDocument.removeEventListener("pointerdown", this.onDocumentPointerDown);
        this.layout.disconnect();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    get open() {
        return this.hasAttribute("open");
    }

    set open(value) {
        this.toggleAttribute("open", Boolean(value));
    }

    sync() {
        const open = this.open;
        this.toggleButton.setAttribute("aria-expanded", String(open));
        this.toggleButton.setAttribute(
            "aria-label",
            this.getAttribute(open ? "close-label" : "open-label") || (open ? "Close navigation" : "Open navigation"),
        );
        this.navigation.setAttribute("aria-label", this.getAttribute("navigation-label") || "Primary navigation");
    }

    close({ restoreFocus = false } = {}) {
        if (!this.open) {
            return;
        }
        this.open = false;
        if (restoreFocus) {
            this.toggleButton.focus();
        }
    }

    measureLayout() {
        this.layout.measure();
    }

    onToggle = () => {
        if (this.hasAttribute("collapsed")) {
            this.open = !this.open;
        }
    };

    onLinkClick = (event) => {
        if (event.composedPath().some(isLink)) {
            this.close();
        }
    };

    onDocumentKeyDown = (event) => {
        if (event.key === "Escape") {
            this.close({ restoreFocus: true });
        }
    };

    onDocumentPointerDown = (event) => {
        if (this.open && !event.composedPath().includes(this)) {
            this.close();
        }
    };
}

function isLink(item) {
    return item instanceof Element && item.matches("a[href]");
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicNavbar);
