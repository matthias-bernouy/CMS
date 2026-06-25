import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private _toggle: HTMLButtonElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._toggle = this.shadowRoot?.querySelector<HTMLButtonElement>(".menu-toggle") ?? null;
        this._toggle?.addEventListener("click", this._onToggleClick);
        this._syncToggle();
    }

    disconnectedCallback(): void {
        this._toggle?.removeEventListener("click", this._onToggleClick);
        this._toggle = null;
    }

    private readonly _onToggleClick = () => {
        this.toggleAttribute("open");
        this._syncToggle();
    };

    private _syncToggle(): void {
        this._toggle?.setAttribute("aria-expanded", this.hasAttribute("open") ? "true" : "false");
    }
}
