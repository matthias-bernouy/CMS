import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

import { upgradeProperty, syncTitle, syncAria } from "./compute";
import { handleToggleClick, handleToggleKey } from "./listener";

export class FormSection extends Component {
    static get observedAttributes() {
        return ["collapsed", "data-title"];
    }

    private _toggle: HTMLElement | null;
    private _title: HTMLElement | null;
    private _content: HTMLElement | null;

    constructor() {
        super({ css, template: template as unknown as string });
        this._toggle = this.shadowRoot?.getElementById("toggle") ?? null;
        this._title = this.shadowRoot?.querySelector(".title-wrapper") ?? null;
        this._content = this.shadowRoot?.getElementById("content") ?? null;
    }

    override connectedCallback() {
        upgradeProperty(this, "collapsed");
        if (this.hasAttribute("data-collapsed") && !this.hasAttribute("collapsed")) {
            this.setAttribute("collapsed", "");
        }
        syncTitle(this, this._title);
        syncAria(this, this._toggle, this._content);
        this._toggle?.addEventListener("click", this._onClick);
        this._toggle?.addEventListener("keydown", this._onKey);
    }

    disconnectedCallback() {
        this._toggle?.removeEventListener("click", this._onClick);
        this._toggle?.removeEventListener("keydown", this._onKey);
    }

    attributeChangedCallback(name: string) {
        if (name === "collapsed") {
            syncAria(this, this._toggle, this._content);
        }
        if (name === "data-title") {
            syncTitle(this, this._title);
        }
    }

    get collapsed(): boolean {
        return this.hasAttribute("collapsed");
    }
    set collapsed(v: boolean) {
        v ? this.setAttribute("collapsed", "") : this.removeAttribute("collapsed");
    }

    private _onClick = () => handleToggleClick(this);
    private _onKey = (e: KeyboardEvent) => handleToggleKey(this, e);
}
