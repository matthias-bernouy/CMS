import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class BasicToast extends Component {
    static observedAttributes = [
        "background-color",
        "border-color",
        "close-color",
        "dismissible",
        "duration",
        "text-color",
    ];

    constructor() {
        super({ css, template });
        this.timer = null;
        this.closeButton = this.shadowRoot.querySelector("button");
    }

    connectedCallback() {
        this.closeButton.addEventListener("click", this.dismiss);
        this.addEventListener("mouseenter", this.clearTimer);
        this.addEventListener("mouseleave", this.scheduleDismiss);
        this.addEventListener("focusin", this.clearTimer);
        this.addEventListener("focusout", this.scheduleDismiss);
        this.sync();
    }

    disconnectedCallback() {
        this.closeButton.removeEventListener("click", this.dismiss);
        this.removeEventListener("mouseenter", this.clearTimer);
        this.removeEventListener("mouseleave", this.scheduleDismiss);
        this.removeEventListener("focusin", this.clearTimer);
        this.removeEventListener("focusout", this.scheduleDismiss);
        this.clearTimer();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    sync() {
        this.closeButton.hidden = this.getAttribute("dismissible") === "false";

        for (const [attribute, property] of [
            ["background-color", "--basic-toast-background"],
            ["border-color", "--basic-toast-border"],
            ["close-color", "--basic-toast-close-color"],
            ["text-color", "--basic-toast-color"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                this.style.setProperty(property, value);
            } else {
                this.style.removeProperty(property);
            }
        }
        this.scheduleDismiss();
    }

    scheduleDismiss = () => {
        this.clearTimer();
        const duration = Number(this.getAttribute("duration") || "4500");
        if (Number.isFinite(duration) && duration > 0) {
            this.timer = setTimeout(() => this.dismiss(), duration);
        }
    };

    clearTimer = () => {
        if (this.timer !== null) {
            clearTimeout(this.timer);
        }
        this.timer = null;
    };

    dismiss = () => {
        if (this.hasAttribute("leaving")) {
            return;
        }
        this.clearTimer();
        this.setAttribute("leaving", "");
        setTimeout(() => {
            this.dispatchEvent(
                new CustomEvent("basic-toast:dismissed", {
                    bubbles: true,
                    composed: true,
                }),
            );
            this.remove();
        }, 180);
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicToast);
