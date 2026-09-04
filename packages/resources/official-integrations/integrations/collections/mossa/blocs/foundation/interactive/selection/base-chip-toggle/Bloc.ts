import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        if (!this.hasAttribute("role")) {
            this.setAttribute("role", "button");
        }
        if (!this.hasAttribute("tabindex")) {
            this.setAttribute("tabindex", "0");
        }
        this.addEventListener("click", this._onActivate);
        this.addEventListener("keydown", this._onKey);
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this._onActivate);
        this.removeEventListener("keydown", this._onKey);
    }

    private _onActivate = () => {
        if (this.hasAttribute("disabled")) {
            return;
        }
        const event = new CustomEvent("chip-toggle", {
            bubbles: true,
            composed: true,
            detail: { value: this.getAttribute("value") ?? "" },
            cancelable: true,
        });
        const proceed = this.dispatchEvent(event);
        if (!proceed) {
            return;
        }
        if (!event.defaultPrevented) {
            this.toggleAttribute("selected");
        }
    };

    private _onKey = (e: KeyboardEvent) => {
        if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            this._onActivate();
        }
    };
}
