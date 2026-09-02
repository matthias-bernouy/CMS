import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class WorkspaceShellDetail extends Component {
    constructor() {
        super({ css, template });
    }

    static get observedAttributes() {
        return ["aside-width", "gap", "main-width"];
    }

    connectedCallback() {
        this.syncLayout();
    }

    attributeChangedCallback() {
        this.syncLayout();
    }

    syncLayout() {
        this.syncLength("main-width", "--workspace-detail-main-width");
        this.syncLength("aside-width", "--workspace-detail-aside-width");
        this.syncLength("gap", "--workspace-detail-gap");
    }

    syncLength(attribute, property) {
        const value = validLength(this.getAttribute(attribute));
        if (value) {
            this.style.setProperty(property, value);
        } else {
            this.style.removeProperty(property);
        }
    }
}

function validLength(value) {
    const candidate = value?.trim() || "";
    return /^\d+(?:\.\d+)?(?:px|rem|em|ch|vw)$/.test(candidate) ? candidate : null;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", WorkspaceShellDetail);
