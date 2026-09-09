import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { formatMoney, parseBooleanAttribute } from "./money";

const optionalSlots = [
    ["media", "media"],
    ["badge", "badges"],
    ["eyebrow", "eyebrow"],
    ["title", "title"],
    ["metadata", "metadata"],
    ["description", "description"],
    ["", "details"],
    ["action", "actions"],
];

export class CommerceOfferPreview extends Component {
    static observedAttributes = ["amount", "currency", "whole-unit-prices"];
    slotVisibilityConnected = false;
    slotVisibilityObserver = null;
    slotVisibilitySync = [];

    constructor() {
        super({ css, template });
    }

    connectedCallback() {
        this.connectSlotVisibility();
        this.observeSlotVisibility();
        this.sync();
    }

    disconnectedCallback() {
        this.slotVisibilityObserver?.disconnect();
        this.slotVisibilityObserver = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    sync() {
        const price = formatMoney(
            this.getAttribute("amount"),
            this.getAttribute("currency"),
            this.ownerDocument.documentElement.lang || this.ownerDocument.defaultView?.navigator.language || "en-US",
            parseBooleanAttribute(this.getAttribute("whole-unit-prices")),
        );
        this.price.textContent = price;
        this.priceContainer.hidden = !price && !this.hasAuthoredSlot("price");
    }

    connectSlotVisibility() {
        if (this.slotVisibilityConnected) {
            return;
        }
        this.slotVisibilityConnected = true;
        for (const [name, part] of optionalSlots) {
            const selector = name ? `slot[name="${name}"]` : "slot:not([name])";
            const slot = this.shadowRoot.querySelector(selector);
            const container = this.shadowRoot.querySelector(`[part="${part}"]`);
            if (!(slot instanceof HTMLSlotElement) || !(container instanceof HTMLElement)) {
                continue;
            }
            const sync = () => {
                container.hidden = !slot.assignedNodes().some(visibleAssignedNode);
            };
            this.slotVisibilitySync.push(sync);
            slot.addEventListener("slotchange", sync);
            sync();
        }
        const priceSlot = this.shadowRoot.querySelector('slot[name="price"]');
        if (priceSlot instanceof HTMLSlotElement) {
            priceSlot.addEventListener("slotchange", () => this.sync());
        }
    }

    observeSlotVisibility() {
        if (this.slotVisibilityObserver) {
            return;
        }
        this.slotVisibilityObserver = new MutationObserver(() => {
            for (const sync of this.slotVisibilitySync) {
                sync();
            }
            this.sync();
        });
        this.slotVisibilityObserver.observe(this, {
            attributes: true,
            attributeFilter: ["hidden", "slot"],
            childList: true,
            subtree: true,
        });
    }

    hasAuthoredSlot(name) {
        return [...this.children].some((child) => child.getAttribute("slot") === name && !child.hasAttribute("hidden"));
    }

    get price() {
        return this.shadowRoot.querySelector("[data-price]");
    }

    get priceContainer() {
        const container = this.shadowRoot.querySelector('[part="price"]');
        if (!(container instanceof HTMLElement)) {
            throw new Error("Offer preview price container is unavailable");
        }
        return container;
    }
}

function visibleAssignedNode(node) {
    if (node.nodeType === node.TEXT_NODE) {
        return Boolean(node.textContent?.trim());
    }
    return node instanceof Element && !node.hasAttribute("hidden");
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferPreview);
