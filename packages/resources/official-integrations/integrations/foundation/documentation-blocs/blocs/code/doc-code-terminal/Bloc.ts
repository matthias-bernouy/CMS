import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    static observedAttributes = ["commands"];
    button = null;
    observer = null;
    slotElement = null;
    source = null;
    timer = null;

    constructor() {
        super({ css, template });
        this.button = this.shadowRoot?.querySelector(".copy") ?? null;
        this.source = this.shadowRoot?.querySelector(".source") ?? null;
        this.observer = new MutationObserver(this.render);
        this.slotElement = this.shadowRoot?.querySelector("slot:not([name])") ?? null;
    }

    connectedCallback() {
        this.button?.addEventListener("click", this.onCopy);
        this.slotElement?.addEventListener("slotchange", this.render);
        this.observer.observe(this, { childList: true, characterData: true, subtree: true });
        this.render();
    }

    disconnectedCallback() {
        this.button?.removeEventListener("click", this.onCopy);
        this.slotElement?.removeEventListener("slotchange", this.render);
        this.observer.disconnect();
        clearTimeout(this.timer);
    }

    attributeChangedCallback() {
        this.render();
    }

    sourceText() {
        const legacy = this.slotElement
            ?.assignedNodes({ flatten: true })
            .map((node) => node.textContent ?? "")
            .join("");
        return (this.getAttribute("commands") ?? legacy ?? "").trim();
    }

    render = () => {
        if (this.source) {
            this.source.textContent = this.sourceText();
        }
    };

    onCopy = async () => {
        try {
            await navigator.clipboard.writeText(this.sourceText());
            this.setAttribute("copied", "");
            clearTimeout(this.timer);
            this.timer = window.setTimeout(() => this.removeAttribute("copied"), 1500);
        } catch {
            this.button?.setAttribute("aria-label", "Unable to copy commands");
        }
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
