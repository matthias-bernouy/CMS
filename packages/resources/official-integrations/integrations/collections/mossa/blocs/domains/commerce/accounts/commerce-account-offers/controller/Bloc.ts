import { Component } from "@bernouy/components/base";
import { refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
import { offerListPresentation, presentationAttributes } from "./presentation";

export class CommerceAccountOffers extends Component {
    static observedAttributes = presentationAttributes;

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.source, (value) => ({
            presentation: offerListPresentation(this, value, this.offset, this.status),
        }));
        this.addEventListener("change", this.onFilterChange);
        this.addEventListener("mossa-pagination:change", this.onPageChange as EventListener);
    }

    disconnectedCallback(): void {
        this.removeEventListener("change", this.onFilterChange);
        this.removeEventListener("mossa-pagination:change", this.onPageChange as EventListener);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            refreshSourceContext(this.source);
        }
    }

    private readonly onFilterChange = (event: Event): void => {
        if (event.target instanceof Element && event.target.matches('[cms-param-sync="commerceOfferStatus"]')) {
            this.setOffset(0);
        }
    };

    private readonly onPageChange = (event: CustomEvent<{ offset?: number }>): void => {
        if (event.target instanceof Element && event.target.localName === "mossa-pagination") {
            this.setOffset(event.detail?.offset);
            this.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    private setOffset(value: unknown): void {
        this.offsetControl.value = String(nonNegativeInteger(value));
        this.offsetControl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    private get source(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="offers"]')!;
    }

    private get offsetControl(): HTMLInputElement {
        return this.querySelector<HTMLInputElement>('[name="commerceOfferOffset"]')!;
    }

    private get offset(): number {
        return nonNegativeInteger(this.offsetControl.value);
    }

    private get status(): string {
        const control = this.querySelector<HTMLInputElement>('[cms-param-sync="commerceOfferStatus"]');
        return control?.value || "all";
    }
}

function nonNegativeInteger(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceAccountOffers);
