import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _copyBtn = null;
    _slot = null;
    _lineNumbers = null;
    _contentObserver = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._copyBtn = this.shadowRoot?.querySelector(".copy") ?? null;
        this._slot = this.shadowRoot?.querySelector("slot:not([name])") ?? null;
        this._lineNumbers = this.shadowRoot?.querySelector(".line-numbers") ?? null;
        this._copyBtn?.addEventListener("click", this._onCopy);
        this._slot?.addEventListener("slotchange", this._renderLineNumbers);
        this._contentObserver = new MutationObserver(this._renderLineNumbers);
        this._contentObserver.observe(this, { childList: true, characterData: true, subtree: true });
        this._renderLineNumbers();
    }
    disconnectedCallback() {
        this._copyBtn?.removeEventListener("click", this._onCopy);
        this._slot?.removeEventListener("slotchange", this._renderLineNumbers);
        this._contentObserver?.disconnect();
    }
    _sourceText = () =>
        this._slot
            ?.assignedNodes({ flatten: true })
            .map((node) => node.textContent ?? "")
            .join("") ?? "";
    _renderLineNumbers = () => {
        if (!this._lineNumbers) {
            return;
        }
        const source = this._sourceText().replace(/\r\n?/g, "\n").trim();
        const count = source ? source.split("\n").length : 1;
        this._lineNumbers.textContent = Array.from({ length: count }, (_, index) => String(index + 1)).join("\n");
    };
    _onCopy = async () => {
        try {
            await navigator.clipboard.writeText(this._sourceText().trim());
            this.setAttribute("copied", "");
            setTimeout(() => this.removeAttribute("copied"), 1500);
        } catch {}
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
