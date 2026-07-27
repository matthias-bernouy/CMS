import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { checkActiveState, setActiveState, updateBadge, updateHref, upgradeProperty } from "./runtime/compute";
import { handleKeydown } from "./runtime/listener";

export class WorkspaceLateralMenuItem extends Component {
    constructor() {
        super({ css, template });
        this.anchor = this.shadowRoot?.querySelector("a") ?? null;
        this.badgeElement = this.shadowRoot?.getElementById("badge-element") ?? null;
    }

    static get observedAttributes() {
        return ["active", "badge", "disabled", "exact", "href"];
    }

    connectedCallback() {
        for (const property of ["active", "badge", "disabled", "exact", "href"]) {
            upgradeProperty(this, property);
        }
        if (!this.hasAttribute("role")) {
            this.setAttribute("role", "listitem");
        }
        if (!this.hasAttribute("tabindex")) {
            this.setAttribute("tabindex", "0");
        }
        updateHref(this.anchor, this.getAttribute("href"));
        updateBadge(this.badgeElement, this.getAttribute("badge"));
        this.syncDisabled();
        checkActiveState(this, this.anchor);
        window.addEventListener("popstate", this.onPopstate);
        this.addEventListener("keydown", this.onKeyDown);
    }

    disconnectedCallback() {
        window.removeEventListener("popstate", this.onPopstate);
        this.removeEventListener("keydown", this.onKeyDown);
    }

    attributeChangedCallback(name, _oldValue, newValue) {
        if (name === "href") {
            updateHref(this.anchor, newValue);
        } else if (name === "badge") {
            updateBadge(this.badgeElement, newValue);
        } else if (name === "disabled") {
            this.syncDisabled();
        }
        if (this.isConnected && ["active", "exact", "href"].includes(name)) {
            name === "active" && newValue !== null
                ? setActiveState(this, this.anchor, true)
                : checkActiveState(this, this.anchor);
        }
    }

    syncDisabled() {
        const disabled = this.hasAttribute("disabled");
        this.setAttribute("aria-disabled", String(disabled));
        this.setAttribute("tabindex", disabled ? "-1" : "0");
    }

    onPopstate = () => checkActiveState(this, this.anchor);
    onKeyDown = (event) => handleKeydown(this, this.anchor, event);

    get href() {
        return this.getAttribute("href");
    }

    set href(value) {
        value === null ? this.removeAttribute("href") : this.setAttribute("href", value);
    }

    get badge() {
        return this.getAttribute("badge");
    }

    set badge(value) {
        value === null ? this.removeAttribute("badge") : this.setAttribute("badge", value);
    }

    get disabled() {
        return this.hasAttribute("disabled");
    }

    set disabled(value) {
        this.toggleAttribute("disabled", Boolean(value));
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
