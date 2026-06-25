import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private _copyright: HTMLSlotElement | null = null;
    private _legal: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._copyright = this.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="copyright"]') ?? null;
        this._legal = this.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="legal"]') ?? null;
        this._copyright?.addEventListener("slotchange", this._syncSlots);
        this._legal?.addEventListener("slotchange", this._syncSlots);
        this._syncSlots();
    }

    disconnectedCallback(): void {
        this._copyright?.removeEventListener("slotchange", this._syncSlots);
        this._legal?.removeEventListener("slotchange", this._syncSlots);
        this._copyright = null;
        this._legal = null;
    }

    private readonly _syncSlots = () => {
        const hasCopyright = (this._copyright?.assignedElements({ flatten: true }).length ?? 0) > 0;
        const hasLegal = (this._legal?.assignedElements({ flatten: true }).length ?? 0) > 0;

        this.toggleAttribute("has-copyright", hasCopyright);
        this.toggleAttribute("has-legal", hasLegal);
        this.toggleAttribute("has-bottom", hasCopyright || hasLegal);
    };
}
