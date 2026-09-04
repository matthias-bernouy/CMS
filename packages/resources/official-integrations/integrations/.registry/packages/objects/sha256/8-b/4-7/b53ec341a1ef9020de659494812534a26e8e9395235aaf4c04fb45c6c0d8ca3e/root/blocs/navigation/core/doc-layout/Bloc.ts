import { Component } from "@bernouy/components/base";
import { DiscoveryController } from "./discovery";
import { LayoutController } from "./layout-controller";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class Bloc extends Component {
    static observedAttributes = ["sidebar-open", "theme"];
    discovery = null;
    layout = null;

    constructor() {
        super({ css, template });
        this.layout = new LayoutController(this);
        this.discovery = new DiscoveryController(this);
    }

    connectedCallback() {
        this.layout.connect();
        this.discovery.connect();
        document.addEventListener("keydown", this.onDocumentKeydown);
        this.syncExpanded();
    }

    disconnectedCallback() {
        this.layout.disconnect();
        this.discovery.disconnect();
        document.removeEventListener("keydown", this.onDocumentKeydown);
    }

    attributeChangedCallback() {
        this.layout.sync();
        this.syncExpanded();
    }

    onDocumentKeydown = (event) => {
        if (event.key === "Escape" && this.hasAttribute("sidebar-open")) {
            event.preventDefault();
            this.layout.close(true);
        }
    };

    syncExpanded() {
        this.shadowRoot
            ?.querySelector(".toggle")
            ?.setAttribute("aria-expanded", String(this.hasAttribute("sidebar-open")));
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
