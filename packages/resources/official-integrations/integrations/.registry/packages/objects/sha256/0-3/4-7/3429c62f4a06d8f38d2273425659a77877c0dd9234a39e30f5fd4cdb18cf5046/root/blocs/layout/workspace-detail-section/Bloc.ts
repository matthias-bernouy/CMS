import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class WorkspaceDetailSection extends Component {
    constructor() {
        super({ css, template });
        this.heading = this.shadowRoot?.querySelector("[data-heading]") ?? null;
        this.description = this.shadowRoot?.querySelector("[data-description]") ?? null;
        this.actionsSlot = this.shadowRoot?.querySelector('slot[name="actions"]') ?? null;
    }

    static get observedAttributes() {
        return ["description", "heading"];
    }

    connectedCallback() {
        this.actionsSlot?.addEventListener("slotchange", this.sync);
        this.sync();
    }

    disconnectedCallback() {
        this.actionsSlot?.removeEventListener("slotchange", this.sync);
    }

    attributeChangedCallback() {
        this.sync();
    }

    sync = () => {
        const heading = this.getAttribute("heading") ?? "";
        const description = this.getAttribute("description") ?? "";
        if (this.heading) {
            this.heading.textContent = heading;
        }
        if (this.description) {
            this.description.textContent = description;
        }
        this.toggleAttribute("has-heading", Boolean(heading.trim()));
        this.toggleAttribute("has-description", Boolean(description.trim()));
        this.toggleAttribute("has-actions", hasAssignedContent(this.actionsSlot));
    };
}

function hasAssignedContent(slot) {
    return Boolean(
        slot
            ?.assignedNodes({ flatten: true })
            .some((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim())),
    );
}

customElements.define("BE5_TAG_TO_BE_REPLACED", WorkspaceDetailSection);
