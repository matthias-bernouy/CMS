import { Component, upgradeProperty } from "@bernouy/components/base";
import { handleBackdropClick, handleCancel, handleClose } from "./listener";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Modal extends Component {
    private _dialog: HTMLDialogElement | null = null;
    private _titleSlot: HTMLSlotElement | null = null;
    private _footerSlot: HTMLSlotElement | null = null;
    private _onBackdrop = (e: MouseEvent) => handleBackdropClick(this, e);
    private _onCancel = (e: Event) => handleCancel(this, e);
    private _onClose = () => handleClose(this);

    static get observedAttributes() {
        return ["open", "aria-label"];
    }

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback() {
        this._dialog ??= this.shadowRoot?.querySelector("dialog") ?? null;
        this._titleSlot ??= this.shadowRoot?.querySelector('slot[name="title"]') ?? null;
        this._footerSlot ??= this.shadowRoot?.querySelector('slot[name="footer"]') ?? null;
        upgradeProperty(this, "open");
        this._dialog?.addEventListener("click", this._onBackdrop);
        this._dialog?.addEventListener("cancel", this._onCancel);
        this._dialog?.addEventListener("close", this._onClose);
        this._footerSlot?.addEventListener("slotchange", this._syncFooter);
        this._titleSlot?.addEventListener("slotchange", this._syncTitle);
        this._syncTitle();
        this.addEventListener("form:success", this.hide);
        this._syncLabel();
        this._syncFooter();
        this._syncOpen();
    }

    disconnectedCallback() {
        this._dialog?.removeEventListener("click", this._onBackdrop);
        this._dialog?.removeEventListener("cancel", this._onCancel);
        this._dialog?.removeEventListener("close", this._onClose);
        this._footerSlot?.removeEventListener("slotchange", this._syncFooter);
        this._titleSlot?.removeEventListener("slotchange", this._syncTitle);
        this.removeEventListener("form:success", this.hide);
    }

    attributeChangedCallback(name: string, _old: string | null, _new: string | null) {
        if (_old === _new || !this.isConnected) {
            return;
        }
        if (name === "aria-label") {
            this._syncLabel();
        } else if (name === "open") {
            this._syncOpen();
        }
    }

    private _syncLabel() {
        const label = this.getAttribute("aria-label");
        if (label) {
            this._dialog?.setAttribute("aria-label", label);
        } else {
            this._dialog?.removeAttribute("aria-label");
        }
    }

    private _syncTitle = (): void => {
        const assigned = this._titleSlot?.assignedNodes({ flatten: true }) ?? [];
        this.toggleAttribute(
            "has-title",
            assigned.some((node) => node.nodeType === Node.ELEMENT_NODE || Boolean(node.textContent?.trim())),
        );
    };

    private _syncFooter = () => {
        const assigned = this._footerSlot?.assignedNodes({ flatten: true }) ?? [];
        this.toggleAttribute(
            "has-footer",
            assigned.some((node) => node.nodeType !== Node.TEXT_NODE || node.textContent?.trim() !== ""),
        );
    };

    private _syncOpen() {
        if (!this._dialog) {
            return;
        }
        const shouldOpen = this.hasAttribute("open");
        if (shouldOpen && !this._dialog.open) {
            this._dialog.showModal();
            this.dispatchEvent(new CustomEvent("open", { bubbles: true, composed: true }));
        } else if (!shouldOpen && this._dialog.open) {
            this._dialog.close();
        }
    }

    get open(): boolean {
        return this.hasAttribute("open");
    }
    set open(v: boolean) {
        v ? this.setAttribute("open", "") : this.removeAttribute("open");
    }

    show() {
        if (!this.hasAttribute("open")) {
            this.setAttribute("open", "");
        }
    }
    showModal() {
        this.show();
    }
    hide() {
        if (this.hasAttribute("open")) {
            this.removeAttribute("open");
        }
    }
    toggle() {
        if (this.open) {
            this.hide();
        } else {
            this.show();
        }
    }
}
