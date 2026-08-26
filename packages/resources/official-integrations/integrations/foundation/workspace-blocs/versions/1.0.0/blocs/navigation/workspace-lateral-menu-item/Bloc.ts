import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { checkActiveState, setActiveState, updateBadge, upgradeProperty } from "./runtime/compute";

export class WorkspaceLateralMenuItem extends Component {
    constructor() {
        super({ css, template });
        this.badgeElement = this.shadowRoot?.getElementById("badge-element") ?? null;
        this.contentSlot = this.shadowRoot?.querySelector("slot") ?? null;
        this.anchorObserver = new MutationObserver(this.onAnchorMutation);
    }

    static get observedAttributes() {
        return ["active", "badge", "exact"];
    }

    connectedCallback() {
        for (const property of ["active", "badge", "exact"]) {
            upgradeProperty(this, property);
        }
        updateBadge(this.badgeElement, this.getAttribute("badge"));
        this.contentSlot?.addEventListener("slotchange", this.syncAnchor);
        this.anchorObserver.observe(this, { attributes: true, attributeFilter: ["href"], subtree: true });
        this.syncAnchor();
        window.addEventListener("popstate", this.onPopstate);
    }

    disconnectedCallback() {
        window.removeEventListener("popstate", this.onPopstate);
        this.contentSlot?.removeEventListener("slotchange", this.syncAnchor);
        this.anchorObserver.disconnect();
    }

    attributeChangedCallback(name, _oldValue, newValue) {
        if (name === "badge") {
            updateBadge(this.badgeElement, newValue);
        }
        if (this.isConnected && ["active", "exact"].includes(name)) {
            name === "active" && newValue !== null
                ? setActiveState(this, this.anchor, true)
                : checkActiveState(this, this.anchor);
        }
    }

    syncAnchor = () => {
        this.anchor = this.querySelector(":scope > a");
        checkActiveState(this, this.anchor);
    };

    onAnchorMutation = () => checkActiveState(this, this.anchor);
    onPopstate = () => checkActiveState(this, this.anchor);

    get badge() {
        return this.getAttribute("badge");
    }

    set badge(value) {
        value === null ? this.removeAttribute("badge") : this.setAttribute("badge", value);
    }

    get active() {
        return this.hasAttribute("active");
    }

    set active(value) {
        this.toggleAttribute("active", Boolean(value));
    }

    get exact() {
        return this.hasAttribute("exact");
    }

    set exact(value) {
        this.toggleAttribute("exact", Boolean(value));
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", WorkspaceLateralMenuItem);
