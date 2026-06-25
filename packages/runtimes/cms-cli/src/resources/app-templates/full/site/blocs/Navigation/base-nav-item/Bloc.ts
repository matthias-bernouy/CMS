import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["href", "target"];

    private _label: HTMLAnchorElement | null = null;
    private _items: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._label = this.shadowRoot?.querySelector<HTMLAnchorElement>(".label") ?? null;
        this._items = this.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="items"]') ?? null;
        this._label?.addEventListener("click", this._onLabelClick);
        this._items?.addEventListener("slotchange", this._syncDropdownState);
        document.addEventListener("mousedown", this._onDocumentMouseDown);
        this._syncAnchor();
        this._syncDropdownState();
    }

    disconnectedCallback(): void {
        this._label?.removeEventListener("click", this._onLabelClick);
        this._items?.removeEventListener("slotchange", this._syncDropdownState);
        document.removeEventListener("mousedown", this._onDocumentMouseDown);
        this._label = null;
        this._items = null;
    }

    attributeChangedCallback(): void {
        this._syncAnchor();
    }

    private readonly _onLabelClick = (event: MouseEvent) => {
        if (!this._hasDropdown()) return;
        event.preventDefault();
        this._toggle();
    };

    private readonly _onDocumentMouseDown = (event: MouseEvent) => {
        if (!this.contains(event.target as Node)) {
            this._close();
        }
    };

    private readonly _syncDropdownState = () => {
        this.toggleAttribute("has-dropdown", this._hasDropdown());
    };

    private _syncAnchor(): void {
        if (!this._label) return;

        const href = this.getAttribute("href");
        const target = this.getAttribute("target");

        if (href) this._label.setAttribute("href", href);
        else this._label.removeAttribute("href");

        if (target) this._label.setAttribute("target", target);
        else this._label.removeAttribute("target");
    }

    private _hasDropdown(): boolean {
        return (this._items?.assignedElements({ flatten: true }).length ?? 0) > 0;
    }

    private _toggle(): void {
        this.shadowRoot?.querySelector(".item")?.classList.toggle("is-open");
    }

    private _close(): void {
        this.shadowRoot?.querySelector(".item")?.classList.remove("is-open");
    }
}
