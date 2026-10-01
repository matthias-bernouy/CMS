import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class ViewState extends Component {
    private readonly retryButton: HTMLButtonElement | null;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        this.retryButton = this.shadowRoot?.querySelector("[data-retry]") ?? null;
    }

    static get observedAttributes(): string[] {
        return ["retry", "retry-label", "state"];
    }

    override connectedCallback(): void {
        this.retryButton?.addEventListener("click", this.onRetry);
        this.sync();
    }

    disconnectedCallback(): void {
        this.retryButton?.removeEventListener("click", this.onRetry);
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private readonly onRetry = (): void => {
        this.dispatchEvent(new CustomEvent("retry", { bubbles: true, composed: true }));
    };

    private sync(): void {
        const state = this.getAttribute("state") ?? "empty";
        this.setAttribute("aria-busy", String(state === "loading"));
        this.setAttribute("role", state === "error" ? "alert" : "status");
        if (this.retryButton) {
            this.retryButton.hidden = !this.hasAttribute("retry") || state === "loading";
            this.retryButton.textContent = this.getAttribute("retry-label") || "Try again";
        }
    }
}

if (!customElements.get("cms-view-state")) {
    customElements.define("cms-view-state", ViewState);
}
