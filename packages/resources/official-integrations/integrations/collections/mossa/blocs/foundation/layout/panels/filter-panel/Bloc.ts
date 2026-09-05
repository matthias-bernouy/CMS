import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private _toggle: HTMLButtonElement | null = null;
    private _reset: HTMLButtonElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    static get observedAttributes() {
        return ["collapsed"];
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._toggle = root.querySelector(".toggle") as HTMLButtonElement | null;
        this._reset = root.querySelector(".reset") as HTMLButtonElement | null;
        this._toggle?.addEventListener("click", this._onToggle);
        this._reset?.addEventListener("click", this._onReset);
        this._syncAria();
    }

    disconnectedCallback(): void {
        this._toggle?.removeEventListener("click", this._onToggle);
        this._reset?.removeEventListener("click", this._onReset);
    }

    attributeChangedCallback(): void {
        this._syncAria();
    }

    private _syncAria() {
        this._toggle?.setAttribute("aria-expanded", String(!this.hasAttribute("collapsed")));
    }

    private _onToggle = () => {
        this.toggleAttribute("collapsed");
    };

    private _onReset = () => {
        const form = this.querySelector<HTMLFormElement>("form");
        form?.reset();
        this.dispatchEvent(new CustomEvent("filters-reset", { bubbles: true }));
    };
}
