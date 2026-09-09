import { Component } from "@bernouy/components/base";
import { refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
import { purchaseCopy } from "../copy";
import { purchasePresentation } from "../presentation";

export class PurchaseList extends Component {
    static observedAttributes = ["order-url", ...Object.keys(purchaseCopy)];

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.source, (value) => ({
            presentation: purchasePresentation(this, value, this.offset),
        }));
        this.addEventListener("mossa-pagination:change", this.onPageChange as EventListener);
    }

    disconnectedCallback(): void {
        this.removeEventListener("mossa-pagination:change", this.onPageChange as EventListener);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            refreshSourceContext(this.source);
        }
    }

    private readonly onPageChange = (event: CustomEvent<{ offset?: number }>): void => {
        if (!(event.target instanceof Element) || event.target.localName !== "mossa-pagination") {
            return;
        }
        this.offsetControl.value = String(nonNegativeInteger(event.detail?.offset));
        this.offsetControl.dispatchEvent(new Event("change", { bubbles: true }));
    };

    private get source(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="purchases"]')!;
    }

    private get offsetControl(): HTMLInputElement {
        return this.querySelector<HTMLInputElement>('[name="mossaPurchasesOffset"]')!;
    }

    private get offset(): number {
        return nonNegativeInteger(this.offsetControl.value);
    }
}

function nonNegativeInteger(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", PurchaseList);
