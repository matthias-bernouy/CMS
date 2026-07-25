import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _copyBtn = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._copyBtn = this.shadowRoot?.querySelector(".copy") ?? null;
        this._copyBtn?.addEventListener("click", this._onCopy);
    }
    disconnectedCallback() {
        this._copyBtn?.removeEventListener("click", this._onCopy);
    }
    _onCopy = async () => {
        const slot = this.shadowRoot?.querySelector("slot:not([name])");
        const text =
            slot
                ?.assignedNodes({ flatten: true })
                .map((n) => n.textContent ?? "")
                .join("") ?? "";
        try {
            await navigator.clipboard.writeText(text.trim());
            this.setAttribute("copied", "");
            setTimeout(() => this.removeAttribute("copied"), 1500);
        } catch {}
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
