import { Component } from "@bernouy/components/base";
import {
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    type SourceObservation,
} from "@bernouy/components/binding";
import { readWithdrawalCopy, withdrawalCopy } from "../copy";
import { withdrawalPresentation } from "../presentation";
import { downloadReceipt, isRecord, newIdempotencyKey } from "./receipt";

export class ServiceWithdrawalForm extends Component {
    static observedAttributes = [...Object.keys(withdrawalCopy), "error-title", "error-message", "empty-message"];

    private stopOrders: (() => void) | null = null;
    private activeForm: HTMLFormElement | null = null;

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.ordersSource, (value) => ({ presentation: withdrawalPresentation(this, value) }));
        this.stopOrders = observeSource(this.ordersSource, this.onOrdersState);
        this.addEventListener("click", this.onClick);
        this.addEventListener("submit", this.onSubmit, true);
    }

    disconnectedCallback(): void {
        this.stopOrders?.();
        this.stopOrders = null;
        this.activeForm = null;
        this.removeEventListener("click", this.onClick);
        this.removeEventListener("submit", this.onSubmit, true);
    }

    attributeChangedCallback(): void {
        if (!this.isConnected) {
            return;
        }
        refreshSourceContext(this.ordersSource);
        if (this.activeForm) {
            refreshSourceContext(this.activeForm);
        }
    }

    private readonly onOrdersState = (state: SourceObservation): void => {
        if (!state.disposed && (state.loaded || state.empty)) {
            queueMicrotask(() => this.connectForm());
        }
    };

    private connectForm(): void {
        const form = this.querySelector<HTMLFormElement>('[cms-source-id="withdrawal"]');
        if (!form || form === this.activeForm) {
            return;
        }
        this.activeForm = form;
        setSourceContext(form, (value) => ({
            presentation: withdrawalPresentation(this, readSourceData(this.ordersSource), value),
        }));
    }

    private readonly onSubmit = (event: Event): void => {
        const form = event.target instanceof HTMLFormElement ? event.target : null;
        if (!form || form.getAttribute("cms-source-id") !== "withdrawal") {
            return;
        }
        const field = form.elements.namedItem("idempotencyKey");
        if (field instanceof HTMLInputElement && !field.value) {
            field.value = newIdempotencyKey();
            field.defaultValue = field.value;
        }
    };

    private readonly onClick = (event: Event): void => {
        const button =
            event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button[value]") : null;
        if (button?.value === "retry-orders") {
            this.ownerDocument.dispatchEvent(new Event("mossa-service-withdrawal:reload"));
        }
        if (button?.value === "download-receipt" && this.activeForm) {
            const value = record(readSourceData(this.activeForm));
            const receipt = record(value?.body);
            if (receipt) {
                downloadReceipt(this.ownerDocument, receipt, this.copy, this.locale);
            }
        }
    };

    private readonly copy = (name: string): string => readWithdrawalCopy(this, name);

    private get ordersSource(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="orders"]')!;
    }

    private get locale(): string {
        return this.ownerDocument.documentElement.lang || this.ownerDocument.defaultView?.navigator.language || "en-US";
    }
}

function record(value: unknown): Record<string, unknown> | null {
    return isRecord(value) ? value : null;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", ServiceWithdrawalForm);
