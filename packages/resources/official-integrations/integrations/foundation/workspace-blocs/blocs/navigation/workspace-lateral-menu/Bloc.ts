import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { upgradeProperty } from "./runtime/compute";
import { handleKeydown } from "./runtime/listener";

export class WorkspaceLateralMenu extends Component {
    constructor() {
        super({ css, template });
        this.sidebar = this.shadowRoot?.querySelector(".sidebar") ?? null;
    }

    static get observedAttributes() {
        return ["collapsed"];
    }

    connectedCallback() {
        upgradeProperty(this, "collapsed");
        if (!this.hasAttribute("aria-label")) {
            this.setAttribute("aria-label", "Workspace navigation");
        }
        this.addEventListener("keydown", this.onKeyDown);
    }

    disconnectedCallback() {
        this.removeEventListener("keydown", this.onKeyDown);
    }

    attributeChangedCallback(name) {
        if (name === "collapsed") {
            this.sidebar?.classList.toggle("collapsed", this.hasAttribute("collapsed"));
        }
    }

    toggle() {
        this.collapsed = !this.collapsed;
    }

    get collapsed() {
        return this.hasAttribute("collapsed");
    }

    set collapsed(value) {
        this.toggleAttribute("collapsed", Boolean(value));
    }

    onKeyDown = (event) => handleKeydown(this, event);
}

customElements.define("BE5_TAG_TO_BE_REPLACED", WorkspaceLateralMenu);
