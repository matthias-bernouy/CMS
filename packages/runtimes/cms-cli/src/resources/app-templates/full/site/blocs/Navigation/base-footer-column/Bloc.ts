import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    private _title: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._title = this.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="title"]') ?? null;
        this._title?.addEventListener("slotchange", this._syncTitle);
        this._syncTitle();
    }

    disconnectedCallback(): void {
        this._title?.removeEventListener("slotchange", this._syncTitle);
        this._title = null;
    }

    private readonly _syncTitle = () => {
        this.toggleAttribute("has-title", (this._title?.assignedElements({ flatten: true }).length ?? 0) > 0);
    };
}
