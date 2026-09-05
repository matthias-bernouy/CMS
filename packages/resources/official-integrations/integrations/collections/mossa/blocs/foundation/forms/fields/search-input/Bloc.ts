import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    declare readonly shadowRoot: ShadowRoot;
    declare toggleAttribute: HTMLElement["toggleAttribute"];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    connectedCallback(): void {
        const input = this.shadowRoot?.querySelector("input");
        const clear = this.shadowRoot?.querySelector(".clear");
        const placeholderSlot = this.shadowRoot?.querySelector('slot[name="placeholder"]') as HTMLSlotElement | null;
        input?.addEventListener("input", this._onInput);
        clear?.addEventListener("click", this._onClear);
        placeholderSlot?.addEventListener("slotchange", this._onPlaceholderChange);
        this._syncPlaceholder();
        this._syncEmpty();
    }

    disconnectedCallback(): void {
        const input = this.shadowRoot?.querySelector("input");
        const clear = this.shadowRoot?.querySelector(".clear");
        const placeholderSlot = this.shadowRoot?.querySelector('slot[name="placeholder"]') as HTMLSlotElement | null;
        input?.removeEventListener("input", this._onInput);
        clear?.removeEventListener("click", this._onClear);
        placeholderSlot?.removeEventListener("slotchange", this._onPlaceholderChange);
    }

    private _onPlaceholderChange = () => this._syncPlaceholder();

    private _syncPlaceholder() {
        const input = this.shadowRoot?.querySelector("input") as HTMLInputElement | null;
        const slot = this.shadowRoot?.querySelector('slot[name="placeholder"]') as HTMLSlotElement | null;
        if (!input || !slot) {
            return;
        }
        const text = slot
            .assignedNodes({ flatten: true })
            .map((n) => n.textContent ?? "")
            .join("")
            .trim();
        input.placeholder = text;
    }

    private _onInput = () => this._syncEmpty();

    private _onClear = () => {
        const input = this.shadowRoot?.querySelector("input") as HTMLInputElement | null;
        if (!input) {
            return;
        }
        input.value = "";
        input.focus();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        this._syncEmpty();
    };

    private _syncEmpty() {
        const input = this.shadowRoot?.querySelector("input") as HTMLInputElement | null;
        this.toggleAttribute("empty", !input?.value);
    }
}
