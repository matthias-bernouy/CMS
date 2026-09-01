import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["source"];
    contentObserver = null;
    copyButton = null;
    lineNumbers = null;
    slotElement = null;
    sourceElement = null;
    copiedTimer = null;

    constructor() {
        super({ css, template });
        this.copyButton = this.shadowRoot?.querySelector(".copy") ?? null;
        this.lineNumbers = this.shadowRoot?.querySelector(".line-numbers") ?? null;
        this.slotElement = this.shadowRoot?.querySelector("slot:not([name])") ?? null;
        this.sourceElement = this.shadowRoot?.querySelector(".source") ?? null;
        this.contentObserver = new MutationObserver(this.render);
    }

    connectedCallback() {
        this.copyButton?.addEventListener("click", this.onCopy);
        this.slotElement?.addEventListener("slotchange", this.render);
        this.contentObserver.observe(this, { childList: true, characterData: true, subtree: true });
        this.render();
    }

    disconnectedCallback() {
        this.copyButton?.removeEventListener("click", this.onCopy);
        this.slotElement?.removeEventListener("slotchange", this.render);
        this.contentObserver.disconnect();
        clearTimeout(this.copiedTimer);
    }

    attributeChangedCallback() {
        this.render();
    }

    sourceText = () =>
        this.getAttribute("source") ??
        this.slotElement
            ?.assignedNodes({ flatten: true })
            .map((node) => node.textContent ?? "")
            .join("") ??
        "";

    render = () => {
        const source = this.sourceText().replace(/\r\n?/g, "\n").trim();
        if (this.sourceElement) {
            this.sourceElement.textContent = source;
        }
        if (!this.lineNumbers) {
            return;
        }
        const count = source ? source.split("\n").length : 1;
        this.lineNumbers.textContent = Array.from({ length: count }, (_, index) => String(index + 1)).join("\n");
    };

    onCopy = async () => {
        try {
            await navigator.clipboard.writeText(this.sourceText().trim());
            this.setAttribute("copied", "");
            clearTimeout(this.copiedTimer);
            this.copiedTimer = window.setTimeout(() => this.removeAttribute("copied"), 1500);
        } catch {
            this.copyButton?.setAttribute("aria-label", "Unable to copy code");
        }
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
