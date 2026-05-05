import { type PageRef } from "./PageLink.picker";
import { buildShadow, type Refs } from "./template";
import { isExternal, isMedia, mediaLabel } from "./detect";
import { fetchPages } from "./parts/flows";
import { wire } from "./parts/wiring";
import { applyMode, closePanel, openPanel, refresh, setValue } from "./parts/controller";

export type LinkMode = "page" | "external" | "media";

/**
 * <p9r-link name="href" label="Link"></p9r-link>
 *
 * Picks a target for an `href`-style attribute: an internal page, an
 * external URL, or a media file via the MediaCenter. Stores the result
 * as a plain string so downstream `<p9r-attr-sync>` stays unchanged.
 */
export class PageLink extends HTMLElement {
    _refs: Refs;
    _options: HTMLElement[] = [];
    _pages: PageRef[] = [];
    _isOpen = false;
    _value = "";
    _mode: LinkMode = "page";
    _pagesFetched = false;

    private _onWindowClick = (e: MouseEvent) => {
        if (this._isOpen && !this.contains(e.target as Node)) this._close();
    };
    private _onTriggerClick = (e: MouseEvent) => {
        e.stopPropagation();
        this._isOpen ? this._close() : this._open();
    };
    private _onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") this._close();
        else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this._isOpen ? this._close() : this._open();
        }
    };

    constructor() {
        super();
        this._refs = buildShadow(this, this.getAttribute("label"));
        wire(this);
    }

    connectedCallback() {
        if (!this._pagesFetched) { this._pagesFetched = true; this._loadPages(); }
        this._refs.trigger.addEventListener("click", this._onTriggerClick);
        this._refs.trigger.addEventListener("keydown", this._onKey);
        window.addEventListener("click", this._onWindowClick);
    }

    disconnectedCallback() {
        this._refs.trigger.removeEventListener("click", this._onTriggerClick);
        this._refs.trigger.removeEventListener("keydown", this._onKey);
        window.removeEventListener("click", this._onWindowClick);
    }

    _open() { openPanel(this); }
    _close() { closePanel(this); }

    private async _loadPages() {
        this._pages = await fetchPages();
        refresh(this, this._pages);
        const v = this.getAttribute("value") || "";
        if (v) this.value = v;
    }

    get value() { return this._value; }
    set value(v: string) {
        if (isMedia(v)) { this._mode = "media"; setValue(this, v, mediaLabel(v)); }
        else if (isExternal(v)) { this._mode = "external"; this._refs.externalInput.value = v; setValue(this, v, v); }
        else {
            this._mode = "page";
            const m = this._pages.find(p => p.path === v);
            setValue(this, v, m ? m.title : (v || "No link"));
        }
        applyMode(this);
    }

    get name() { return this.getAttribute("name"); }
}

if (!customElements.get("p9r-link")) customElements.define("p9r-link", PageLink);
