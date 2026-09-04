import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

/**
 * `<cs-shipping-option>` — a rich radio card for shipping choices.
 *
 * Wraps an `<input type="radio">` inside the shadow `<label>` so a click
 * anywhere on the card toggles the native radio. The radio's `name`,
 * `value`, `disabled` and `checked` are mirrored from host attributes
 * so a sibling group of options shares the same `name` and behaves like
 * a native radio group (the browser auto-unchecks the others).
 *
 * Note: because the radio lives in the shadow root, it does NOT
 * participate in an outer `<form>` submission natively. For runtime
 * use inside a `<base-form>`, expose the selected value via a host
 * attribute (`value` when checked) that the form collector reads.
 */
export class Bloc extends Component {
    static observedAttributes = ["name", "value", "disabled", "checked"];

    private _radio: HTMLInputElement | null = null;
    private _noteSlot: HTMLSlotElement | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        this._radio = root.querySelector("input.radio");
        this._noteSlot = root.querySelector('slot[name="note"]');

        this._radio?.addEventListener("change", this._onRadioChange);
        this._noteSlot?.addEventListener("slotchange", this._onNoteSlotChange);

        this._sync();
        this._onNoteSlotChange();
    }

    disconnectedCallback(): void {
        this._radio?.removeEventListener("change", this._onRadioChange);
        this._noteSlot?.removeEventListener("slotchange", this._onNoteSlotChange);
    }

    attributeChangedCallback(): void {
        this._sync();
    }

    private _sync(): void {
        if (!this._radio) {
            return;
        }
        this._radio.name = this.getAttribute("name") ?? "";
        this._radio.value = this.getAttribute("value") ?? "";
        this._radio.disabled = this.hasAttribute("disabled");
        this._radio.checked = this.hasAttribute("checked");
    }

    private _onRadioChange = () => {
        if (this._radio?.checked) {
            // Mirror the checked state on the host so outer code can
            // read `[checked]`. Browser handles unchecking siblings
            // because they share the radio `name`.
            this.setAttribute("checked", "");
            // Notify peers with the same name living outside the shadow
            // — they cannot see our shadow radio so we must tell them.
            const name = this.getAttribute("name");
            if (name) {
                const peers = document.querySelectorAll(`cs-shipping-option[name="${name}"]`);
                peers.forEach((p) => {
                    if (p !== this) {
                        p.removeAttribute("checked");
                    }
                });
            }
            this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        } else {
            this.removeAttribute("checked");
        }
    };

    private _onNoteSlotChange = () => {
        const has = (this._noteSlot?.assignedNodes({ flatten: true }) ?? []).some(
            (n) =>
                n.nodeType === Node.ELEMENT_NODE ||
                (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0),
        );
        this.toggleAttribute("has-note", has);
    };

    get value(): string {
        return this._radio?.checked ? (this._radio?.value ?? "") : "";
    }
}
