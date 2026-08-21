import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import variantCss from "./variant.css" with { type: "text" };
const css = baseCss + variantCss;

import { upgradeProperty, updateHref, updateBadge, checkActiveState, setActiveState } from "./compute";
import { handleKeydown } from "./listener";

export class LateralMenuItem extends Component {
    private _anchor: HTMLAnchorElement | null;
    private _badgeEl: HTMLElement | null;
    private _quickActionsSlot: HTMLSlotElement | null;
    private _moreActionsSlot: HTMLSlotElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._anchor = this.shadowRoot?.querySelector("a") ?? null;
        this._badgeEl = this.shadowRoot?.getElementById("badge-element") ?? null;
        this._quickActionsSlot = this.shadowRoot?.querySelector('slot[name="quick-actions"]') ?? null;
        this._moreActionsSlot = this.shadowRoot?.querySelector('slot[name="more-actions"]') ?? null;
    }

    static get observedAttributes(): string[] {
        return ["href", "badge", "disabled", "active", "exact"];
    }

    override connectedCallback(): void {
        for (const prop of ["href", "badge", "disabled", "active", "exact"]) {
            upgradeProperty(this, prop);
        }

        if (!this.hasAttribute("role")) {
            this.setAttribute("role", "listitem");
        }
        if (!this.hasAttribute("tabindex")) {
            this.setAttribute("tabindex", "0");
        }

        updateHref(this._anchor, this.getAttribute("href"));
        updateBadge(this._badgeEl, this.getAttribute("badge"));
        checkActiveState(this, this._anchor);

        window.addEventListener("popstate", this._onPopstate);
        this.addEventListener("keydown", this._onKey);
        this.addEventListener("click", this._onActionClick);
        for (const slot of this.actionSlots()) {
            slot.addEventListener("slotchange", this._syncActionSlots);
        }
        this._syncActionSlots();
    }

    disconnectedCallback(): void {
        window.removeEventListener("popstate", this._onPopstate);
        this.removeEventListener("keydown", this._onKey);
        this.removeEventListener("click", this._onActionClick);
        for (const slot of this.actionSlots()) {
            slot.removeEventListener("slotchange", this._syncActionSlots);
        }
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null): void {
        if (!this._anchor) {
            return;
        }
        if (name === "href") {
            updateHref(this._anchor, newVal);
            if (this.isConnected) {
                checkActiveState(this, this._anchor);
            }
        }
        if (name === "badge") {
            updateBadge(this._badgeEl, newVal);
        }
        if (name === "active") {
            if (newVal !== null) {
                setActiveState(this, this._anchor, true);
            } else {
                checkActiveState(this, this._anchor);
            }
        }
        if (name === "exact" && this.isConnected) {
            checkActiveState(this, this._anchor);
        }
        if (name === "disabled") {
            const isDisabled = this.hasAttribute("disabled");
            this.setAttribute("aria-disabled", isDisabled ? "true" : "false");
            this.setAttribute("tabindex", isDisabled ? "-1" : "0");
        }
    }

    get href() {
        return this.getAttribute("href");
    }
    set href(v: string | null) {
        v == null ? this.removeAttribute("href") : this.setAttribute("href", v);
    }

    get badge() {
        return this.getAttribute("badge");
    }
    set badge(v: string | null) {
        v == null ? this.removeAttribute("badge") : this.setAttribute("badge", v);
    }

    get disabled() {
        return this.hasAttribute("disabled");
    }
    set disabled(v: boolean) {
        v ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }

    get active() {
        return this.hasAttribute("active");
    }
    set active(v: boolean) {
        v ? this.setAttribute("active", "") : this.removeAttribute("active");
    }

    get exact() {
        return this.hasAttribute("exact");
    }
    set exact(v: boolean) {
        v ? this.setAttribute("exact", "") : this.removeAttribute("exact");
    }

    private _onPopstate = () => checkActiveState(this, this._anchor);
    private _onKey = (e: KeyboardEvent) => handleKeydown(this, this._anchor, e);
    private _onActionClick = (event: Event): void => {
        const target = event.target as Element | null;
        if (target?.closest('[slot="quick-actions"], [slot="more-actions"]')) {
            event.stopPropagation();
        }
    };
    private _syncActionSlots = (): void => {
        this.toggleAttribute("has-quick-actions", Boolean(this._quickActionsSlot?.assignedElements().length));
        this.toggleAttribute("has-more-actions", Boolean(this._moreActionsSlot?.assignedElements().length));
    };

    private actionSlots(): HTMLSlotElement[] {
        return [this._quickActionsSlot, this._moreActionsSlot].filter((slot): slot is HTMLSlotElement => slot !== null);
    }
}
