import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import baseCss from "./base.css" with { type: "text" };
import variantCss from "./variant.css" with { type: "text" };
import responsiveCss from "./responsive.css" with { type: "text" };
const css = baseCss + variantCss + responsiveCss;

import { upgradeProperty } from "./compute";
import { emitOpen } from "./emit";
import { handleBackdropClick, handleCancel, handleClose, handleCloseClick } from "./listener";

export class LateralDialog extends Component {
    private _dialog: HTMLDialogElement | null;
    private _closeBtn: HTMLButtonElement | null;

    static get observedAttributes() {
        return ["open"];
    }

    constructor() {
        super({ css, template: template as unknown as string });
        this._dialog = this.shadowRoot?.querySelector("dialog") ?? null;
        this._closeBtn = this.shadowRoot?.querySelector("#close-btn") ?? null;
    }

    override connectedCallback() {
        upgradeProperty(this, "open");
        this._dialog?.addEventListener("click", this._onBackdrop);
        this._dialog?.addEventListener("cancel", this._onCancel);
        this._dialog?.addEventListener("close", this._onClose);
        this._closeBtn?.addEventListener("click", this._onCloseClick);
    }

    disconnectedCallback() {
        this._dialog?.removeEventListener("click", this._onBackdrop);
        this._dialog?.removeEventListener("cancel", this._onCancel);
        this._dialog?.removeEventListener("close", this._onClose);
        this._closeBtn?.removeEventListener("click", this._onCloseClick);
    }

    attributeChangedCallback(name: string) {
        if (!this._dialog) {
            return;
        }
        if (name === "open") {
            const shouldOpen = this.hasAttribute("open");
            if (shouldOpen && !this._dialog.open) {
                this._dialog.showModal();
            } else if (!shouldOpen && this._dialog.open) {
                this._dialog.close();
            }
        }
    }

    private _onBackdrop = (e: MouseEvent) => handleBackdropClick(this, e);
    private _onCloseClick = (e: Event) => handleCloseClick(this, e);
    private _onCancel = (e: Event) => handleCancel(this, e);
    private _onClose = () => handleClose(this);

    get open() {
        return this.hasAttribute("open");
    }
    set open(val: boolean) {
        if (val) {
            this.setAttribute("open", "");
        } else {
            this.removeAttribute("open");
        }
    }

    show() {
        if (!this._dialog) {
            return;
        }
        if (!this._dialog.open) {
            this._dialog.showModal();
        }
        if (!this.hasAttribute("open")) {
            this.setAttribute("open", "");
        }
        emitOpen(this);
    }

    showModal() {
        this.show();
    }

    close() {
        if (!this._dialog) {
            return;
        }
        if (this._dialog.open) {
            this._dialog.close();
        }
    }
}
