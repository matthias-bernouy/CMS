import { Component } from "@bernouy/components/base";
import { refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
import { negotiationListPresentation, presentationAttributes } from "../presentation";

export class CommerceNegotiationList extends Component {
    static observedAttributes = presentationAttributes;

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.source, (value) => ({
            presentation: negotiationListPresentation(this, value, this.offset, this.filtered),
        }));
        this.addEventListener("change", this.onFilterChange);
        this.addEventListener("mossa-pagination:change", this.onPageChange as EventListener);
        this.addEventListener("submit", this.onSubmit, true);
        this.addEventListener("cms-source:success", this.onSourceSuccess as EventListener);
        this.addEventListener("cms-source:failed", this.onSourceFailed as EventListener);
    }

    disconnectedCallback(): void {
        this.removeEventListener("change", this.onFilterChange);
        this.removeEventListener("mossa-pagination:change", this.onPageChange as EventListener);
        this.removeEventListener("submit", this.onSubmit, true);
        this.removeEventListener("cms-source:success", this.onSourceSuccess as EventListener);
        this.removeEventListener("cms-source:failed", this.onSourceFailed as EventListener);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            refreshSourceContext(this.source);
        }
    }

    private readonly onFilterChange = (event: Event): void => {
        const control = event.target instanceof Element ? event.target.getAttribute("cms-param-sync") : null;
        if (control === "mossaNegotiationRole" || control === "mossaNegotiationStatus") {
            this.setOffset(0);
        }
    };

    private readonly onPageChange = (event: CustomEvent<{ offset?: number }>): void => {
        this.setOffset(nonNegativeInteger(event.detail?.offset, 0));
        this.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    private readonly onSubmit = (event: Event): void => {
        const action = actionFrom(event.target);
        if (!action) {
            return;
        }
        const message = this.getAttribute(`confirm-${action}-message`)?.trim() || confirmMessage(action);
        if (this.ownerDocument.defaultView?.confirm(message) === false) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    };

    private readonly onSourceSuccess = (event: CustomEvent<{ body?: unknown }>): void => {
        const action = actionFrom(event.target);
        if (!action) {
            return;
        }
        this.showFeedback(this.getAttribute(`success-${action}-message`)?.trim() || successMessage(action), false);
        const completed = action === "withdraw" ? "withdrawn" : `${action}ed`;
        this.dispatchEvent(
            new CustomEvent(`commerce-negotiation:${completed}`, {
                bubbles: true,
                composed: true,
                detail: event.detail?.body,
            }),
        );
    };

    private readonly onSourceFailed = (event: Event): void => {
        if (actionFrom(event.target)) {
            this.showFeedback(this.getAttribute("error-message")?.trim() || "The proposal could not be updated.", true);
        }
    };

    private setOffset(offset: number): void {
        const control = this.querySelector<HTMLInputElement>('[cms-param-sync="mossaNegotiationOffset"]');
        if (!control) {
            return;
        }
        const value = offset > 0 ? String(offset) : "";
        if (control.value !== value) {
            control.value = value;
            control.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    private showFeedback(message: string, error: boolean): void {
        const feedback = this.querySelector<HTMLElement>(".negotiation-feedback");
        if (!feedback) {
            return;
        }
        feedback.textContent = message;
        feedback.setAttribute("tone", error ? "danger" : "success");
        feedback.setAttribute("role", error ? "alert" : "status");
        feedback.hidden = false;
    }

    private get offset(): number {
        return nonNegativeInteger(
            this.querySelector<HTMLInputElement>('[cms-param-sync="mossaNegotiationOffset"]')?.value,
            0,
        );
    }

    private get filtered(): boolean {
        return ["mossaNegotiationRole", "mossaNegotiationStatus"].some((name) =>
            Boolean(this.querySelector<HTMLElement & { value?: string }>(`[cms-param-sync="${name}"]`)?.value),
        );
    }

    private get source(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="proposals"]')!;
    }
}

function actionFrom(target: EventTarget | null): string {
    return target instanceof HTMLFormElement ? String(new FormData(target).get("action") || "") : "";
}

function confirmMessage(action: string): string {
    return action === "accept"
        ? "Accept this proposal?"
        : action === "reject"
          ? "Reject this proposal permanently?"
          : "Withdraw this proposal?";
}

function successMessage(action: string): string {
    return action === "accept"
        ? "The proposal was accepted."
        : action === "reject"
          ? "The proposal was rejected."
          : "Your proposal was withdrawn.";
}

function nonNegativeInteger(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceNegotiationList);
