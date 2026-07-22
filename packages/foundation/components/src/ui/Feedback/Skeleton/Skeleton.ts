import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Skeleton extends Component {
    static get observedAttributes() {
        return ["width", "height"];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }

    override connectedCallback() {
        this._syncSize();
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (name === "width" || name === "height") {
            this._syncSize();
        }
    }

    private _syncSize() {
        const width = this.getAttribute("width");
        const height = this.getAttribute("height");
        if (width !== null) {
            this.style.setProperty("--_width", this._normalize(width));
        } else {
            this.style.removeProperty("--_width");
        }
        if (height !== null) {
            this.style.setProperty("--_height", this._normalize(height));
        } else {
            this.style.removeProperty("--_height");
        }
    }

    private _normalize(v: string): string {
        return /^\d+(\.\d+)?$/.test(v) ? `${v}px` : v;
    }
}
