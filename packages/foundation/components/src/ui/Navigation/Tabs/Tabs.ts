import { Component } from "@bernouy/components/base";

import template from "./view/template.html" with { type: "text" };
import baseCss from "./view/base.css" with { type: "text" };
import variantCss from "./view/variant.css" with { type: "text" };
const css = baseCss + variantCss;

import { rebuildTabs, activateTab } from "./domain/tabs";
import { handleTablistClick, handleKeydown } from "./listener";

export class Tabs extends Component {
    private _tablist: HTMLElement | null;
    private _slot: HTMLSlotElement | null;

    static get observedAttributes() {
        return ["active"];
    }

    constructor() {
        super({ css, template: template as unknown as string });
        this._tablist = this.shadowRoot?.querySelector(".tablist") ?? null;
        this._slot = this.shadowRoot?.querySelector("slot") ?? null;
    }

    override connectedCallback() {
        this._slot?.addEventListener("slotchange", this._onRebuild);
        this._tablist?.addEventListener("click", this._onClick);
        this._tablist?.addEventListener("keydown", this._onKey);
        rebuildTabs(this, this._tablist, this._slot);
    }

    disconnectedCallback() {
        this._slot?.removeEventListener("slotchange", this._onRebuild);
        this._tablist?.removeEventListener("click", this._onClick);
        this._tablist?.removeEventListener("keydown", this._onKey);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (name === "active" && newVal !== null) {
            activateTab(this, this._tablist, this._slot, newVal);
        }
    }

    get active(): string {
        return this.getAttribute("active") ?? "";
    }
    set active(v: string) {
        this.setAttribute("active", v);
    }

    private _onRebuild = () => rebuildTabs(this, this._tablist, this._slot);
    private _onClick = (e: Event) => handleTablistClick(this, this._tablist, this._slot, e);
    private _onKey = (e: KeyboardEvent) => handleKeydown(this, this._tablist, this._slot, e);
}
