import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import baseCss from "./style.css" with { type: "text" };
import embeddedCss from "./embedded.css" with { type: "text" };
const css = baseCss + embeddedCss;

import { upgradeProperty } from "./internal/compute";
import { handleKeydown } from "./internal/listener";
import { LateralMenuScrollSpy } from "./ScrollSpy/ScrollSpy";
import { LATERAL_MENU_ITEM_CHANGE_EVENT } from "./LateralMenuItem/LateralMenuItem";

export class LateralMenu extends Component {
    private _sidebar: HTMLElement | null;
    private _embeddedToggle: HTMLButtonElement | null;
    private _itemSlot: HTMLSlotElement | null;
    private _scrollSpyItem?: HTMLElement;
    private readonly _scrollSpy: LateralMenuScrollSpy;

    constructor() {
        super({ css, template: template as unknown as string });
        this._sidebar = this.shadowRoot?.querySelector(".sidebar") ?? null;
        this._embeddedToggle = this.shadowRoot?.querySelector(".embedded-toggle") ?? null;
        this._itemSlot = this.shadowRoot?.querySelector("slot:not([name])") ?? null;
        this._scrollSpy = new LateralMenuScrollSpy(this, this._onScrollSpySelection);
    }

    static get observedAttributes(): string[] {
        return ["collapsed", "open", "compact-label", "scrollspy", "scrollspy-offset"];
    }

    override connectedCallback(): void {
        upgradeProperty(this, "collapsed");
        if (!this.hasAttribute("aria-label")) {
            this.setAttribute("aria-label", "Main navigation");
        }
        this._syncEmbeddedToggle();
        this.addEventListener("keydown", this._onKey);
        this.addEventListener("click", this._onClick);
        this.addEventListener(LATERAL_MENU_ITEM_CHANGE_EVENT, this._onItemsChange);
        this._embeddedToggle?.addEventListener("click", this._onToggle);
        this._itemSlot?.addEventListener("slotchange", this._onItemsChange);
        this._syncOutsideClick();
        if (this.hasAttribute("scrollspy")) {
            this._scrollSpy.connect();
        }
    }

    disconnectedCallback(): void {
        this.removeEventListener("keydown", this._onKey);
        this.removeEventListener("click", this._onClick);
        this.removeEventListener(LATERAL_MENU_ITEM_CHANGE_EVENT, this._onItemsChange);
        this._embeddedToggle?.removeEventListener("click", this._onToggle);
        this._itemSlot?.removeEventListener("slotchange", this._onItemsChange);
        document.removeEventListener("pointerdown", this._onOutsideClick);
        this._scrollSpy.disconnect();
    }

    attributeChangedCallback(name: string): void {
        if (!this._sidebar) {
            return;
        }
        if (name === "collapsed") {
            this._sidebar.classList.toggle("collapsed", this.hasAttribute("collapsed"));
        }
        if (name === "open" || name === "compact-label") {
            this._syncEmbeddedToggle();
        }
        if (name === "open" && this.isConnected) {
            this._syncOutsideClick();
        }
        if (name === "scrollspy" && this.isConnected) {
            this.hasAttribute("scrollspy") ? this._scrollSpy.connect() : this._scrollSpy.disconnect();
        }
        if (name === "scrollspy-offset" && this.hasAttribute("scrollspy")) {
            this._scrollSpy.scheduleRefresh();
        }
    }

    toggle(): void {
        this.collapsed = !this.collapsed;
    }

    get collapsed(): boolean {
        return this.hasAttribute("collapsed");
    }
    set collapsed(val: boolean) {
        if (val) {
            this.setAttribute("collapsed", "");
        } else {
            this.removeAttribute("collapsed");
        }
    }

    private _onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape" && this.hasAttribute("open")) {
            event.preventDefault();
            this.removeAttribute("open");
            this._embeddedToggle?.focus();
            return;
        }
        handleKeydown(this, event);
    };
    private _onToggle = (event: Event) => {
        event.stopPropagation();
        this.toggleAttribute("open");
    };
    private _onClick = (event: Event) => {
        if (
            event.composedPath().some((target) => target instanceof Element && target.matches("w13c-lateral-menu-item"))
        ) {
            this.removeAttribute("open");
        }
    };
    private _onOutsideClick = (event: Event): void => {
        if (this.hasAttribute("open") && !event.composedPath().includes(this)) {
            this.removeAttribute("open");
        }
    };
    private _onItemsChange = (): void => {
        if (this.hasAttribute("scrollspy")) {
            this._scrollSpy.scheduleRefresh();
        }
    };
    private _onScrollSpySelection = (item?: HTMLElement): void => {
        this._scrollSpyItem = item;
        this._syncEmbeddedToggle();
    };

    private _syncOutsideClick(): void {
        if (this.hasAttribute("open")) {
            document.addEventListener("pointerdown", this._onOutsideClick);
        } else {
            document.removeEventListener("pointerdown", this._onOutsideClick);
        }
    }

    private _syncEmbeddedToggle(): void {
        if (!this._embeddedToggle) {
            return;
        }
        this._embeddedToggle.setAttribute("aria-expanded", String(this.hasAttribute("open")));
        const label = this.getAttribute("compact-label")?.trim() || this.getAttribute("aria-label") || "Navigation";
        const selection = this._scrollSpyItem?.textContent?.replace(/\s+/g, " ").trim();
        this._embeddedToggle.querySelector("span")!.textContent = selection || label;
        this._embeddedToggle.setAttribute("aria-label", selection ? `${label}: ${selection}` : label);
    }
}
