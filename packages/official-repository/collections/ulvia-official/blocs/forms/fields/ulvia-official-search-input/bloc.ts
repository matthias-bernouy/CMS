import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private input: HTMLInputElement | null = null;
    private clearButton: HTMLButtonElement | null = null;
    private root: Document | ShadowRoot | null = null;
    private submitTimer: number | undefined;

    static get observedAttributes(): string[] {
        return ["clear-label"];
    }

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.input = this.querySelector<HTMLInputElement>("input");
        this.clearButton = this.querySelector<HTMLButtonElement>("[data-search-clear]");
        this.root = this.getRootNode() as Document | ShadowRoot;
        this.prepareInput();
        this.input?.addEventListener("input", this.handleInput);
        this.root.addEventListener("reset", this.handleReset);
        this.clearButton?.addEventListener("click", this.clearSearch);
        this.syncValue();
    }

    disconnectedCallback(): void {
        this.input?.removeEventListener("input", this.handleInput);
        this.root?.removeEventListener("reset", this.handleReset);
        this.root = null;
        this.clearButton?.removeEventListener("click", this.clearSearch);
        window.clearTimeout(this.submitTimer);
    }

    attributeChangedCallback(): void {
        this.syncValue();
    }

    private prepareInput(): void {
        if (!this.input) {
            return;
        }
        this.input.type = "text";
        this.input.setAttribute("role", "searchbox");
        if (!this.input.enterKeyHint) {
            this.input.enterKeyHint = "search";
        }
    }

    private handleInput = (): void => {
        this.syncValue();
        if (!this.hasAttribute("auto-submit")) {
            return;
        }
        window.clearTimeout(this.submitTimer);
        const configuredDelay = Number(this.getAttribute("submit-delay") ?? "300");
        const delay = Number.isFinite(configuredDelay) ? Math.max(0, configuredDelay) : 300;
        this.submitTimer = window.setTimeout(() => this.input?.form?.requestSubmit(), delay);
    };

    private clearSearch = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.input || this.input.disabled || this.input.readOnly) {
            return;
        }
        this.input.value = "";
        this.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        this.input.dispatchEvent(new Event("search", { bubbles: true, composed: true }));
        this.input.focus();
    };

    private handleReset = (event: Event): void => {
        if (event.target !== this.input?.form) {
            return;
        }
        window.clearTimeout(this.submitTimer);
        window.setTimeout(() => this.syncValue());
    };

    private syncValue(): void {
        this.clearButton?.toggleAttribute("hidden", !this.input?.value);
        this.clearButton?.setAttribute("aria-label", this.getAttribute("clear-label") || "Clear search");
    }
}
