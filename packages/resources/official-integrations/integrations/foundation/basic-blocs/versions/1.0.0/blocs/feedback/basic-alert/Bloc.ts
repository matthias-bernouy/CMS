import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class BasicAlert extends Component {
    static observedAttributes = ["close-label", "dismissible"];

    constructor() {
        super({ css, template });
        this.closeButton = this.shadowRoot.querySelector("button");
        this.iconElement = this.shadowRoot.querySelector(".icon");
        this.iconSlot = this.shadowRoot.querySelector('slot[name="icon"]');
        this.messageElement = this.shadowRoot.querySelector(".message");
        this.messageSlot = this.shadowRoot.querySelector(".message slot");
        this.titleElement = this.shadowRoot.querySelector(".title");
        this.titleSlot = this.shadowRoot.querySelector('slot[name="title"]');
    }

    connectedCallback() {
        this.closeButton?.addEventListener("click", this.dismiss);
        for (const slot of this.slots()) {
            slot?.addEventListener("slotchange", this.sync);
        }
        this.sync();
    }

    disconnectedCallback() {
        this.closeButton?.removeEventListener("click", this.dismiss);
        for (const slot of this.slots()) {
            slot?.removeEventListener("slotchange", this.sync);
        }
    }

    attributeChangedCallback() {
        this.sync();
    }

    dismiss = () => {
        const event = new CustomEvent("dismiss", { bubbles: true, cancelable: true, composed: true });
        if (this.dispatchEvent(event)) {
            this.remove();
        }
    };

    sync = () => {
        if (this.closeButton) {
            this.closeButton.toggleAttribute("hidden", !enabledAttribute(this, "dismissible"));
            this.closeButton.setAttribute("aria-label", this.getAttribute("close-label")?.trim() || "Dismiss alert");
        }
        if (this.iconElement) {
            this.iconElement.toggleAttribute("hidden", !hasAssignedContent(this.iconSlot));
        }
        if (this.titleElement) {
            this.titleElement.toggleAttribute("hidden", !hasAssignedContent(this.titleSlot));
        }
        if (this.messageElement) {
            this.messageElement.toggleAttribute("hidden", !hasAssignedContent(this.messageSlot));
        }
    };

    slots() {
        return [this.iconSlot, this.titleSlot, this.messageSlot];
    }
}

function enabledAttribute(element, name) {
    return element.hasAttribute(name) && element.getAttribute(name) !== "false";
}

function hasAssignedContent(slot) {
    return Boolean(
        slot
            ?.assignedNodes({ flatten: true })
            .some((node) => node.nodeType === Node.ELEMENT_NODE || Boolean(node.textContent?.trim())),
    );
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicAlert);
