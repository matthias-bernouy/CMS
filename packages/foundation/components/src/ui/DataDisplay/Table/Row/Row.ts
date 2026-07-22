import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

import { handleClick, handleKeydown } from "./listener";
import { syncLinkA11y, upgradeProperty } from "./compute";

export class TableRow extends Component {
    static get observedAttributes() {
        return ["href"];
    }

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback() {
        for (const prop of ["href", "target"]) {
            upgradeProperty(this, prop);
        }

        this.addEventListener("click", this._onClick);
        this.addEventListener("keydown", this._onKey);
        syncLinkA11y(this);
    }

    disconnectedCallback() {
        this.removeEventListener("click", this._onClick);
        this.removeEventListener("keydown", this._onKey);
    }

    attributeChangedCallback(name: string) {
        if (name === "href") {
            syncLinkA11y(this);
        }
    }

    private _onClick = () => handleClick(this);
    private _onKey = (e: KeyboardEvent) => handleKeydown(this, e);

    get href() {
        return this.getAttribute("href");
    }
    set href(val: string | null) {
        if (val === null) {
            this.removeAttribute("href");
        } else {
            this.setAttribute("href", val);
        }
    }

    get target() {
        return this.getAttribute("target");
    }
    set target(val: string | null) {
        if (val === null) {
            this.removeAttribute("target");
        } else {
            this.setAttribute("target", val);
        }
    }
}
