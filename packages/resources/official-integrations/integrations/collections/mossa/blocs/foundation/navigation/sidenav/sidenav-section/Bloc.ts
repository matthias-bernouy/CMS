import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._header = this.shadowRoot?.querySelector(".header") as HTMLButtonElement | null;
        this._titleSlot = this.shadowRoot?.querySelector('slot[name="title"]') as HTMLSlotElement | null;

        this._header?.removeEventListener("click", this._onHeaderClick);
        this._header?.addEventListener("click", this._onHeaderClick);

        this._titleSlot?.addEventListener("slotchange", this._onTitleSlotChange);
        this._onTitleSlotChange();

        this._syncAria();
    }

    disconnectedCallback(): void {
        this._header?.removeEventListener("click", this._onHeaderClick);
        this._titleSlot?.removeEventListener("slotchange", this._onTitleSlotChange);
        this._header = null;
        this._titleSlot = null;
    }

    static observedAttributes = ["open", "collapsible"];

    attributeChangedCallback(): void {
        this._syncAria();
    }

    private _header: HTMLButtonElement | null = null;
    private _titleSlot: HTMLSlotElement | null = null;

    private _onHeaderClick = () => {
        if (!this.hasAttribute("collapsible")) {
            return;
        }
        this.toggleAttribute("open");
    };

    /** Mirror title-slot presence — rule 12 (no :host(:has())) again. */
    private _onTitleSlotChange = () => {
        const has = (this._titleSlot?.assignedNodes({ flatten: true }).length ?? 0) > 0;
        this.toggleAttribute("has-title", has);
    };

    private _syncAria(): void {
        if (!this._header) {
            return;
        }
        const collapsible = this.hasAttribute("collapsible");
        const open = !collapsible || this.hasAttribute("open");
        this._header.setAttribute("aria-expanded", String(open));
    }
}
