import { Component } from "@bernouy/components/base";
import {
    observeSource,
    readSourceData,
    refreshSourceContext,
    setSourceContext,
    type SourceObservation,
} from "@bernouy/components/binding";
import { minorUnits, negotiationCopy, negotiationPresentation, readPolicy } from "../presentation";

export class CommerceNegotiationForm extends Component {
    static observedAttributes = [
        ...Object.keys(negotiationCopy),
        "appearance",
        "copy",
        "density",
        "show-message",
        "unavailable-message",
    ];

    private stopPolicy: (() => void) | null = null;
    private stopProposals: (() => void) | null = null;

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.policySource, (policy) => ({
            presentation: negotiationPresentation(this, policy, readSourceData(this.proposalsSource)),
        }));
        this.stopPolicy = observeSource(this.policySource, this.onPolicyState);
        this.stopProposals = observeSource(this.proposalsSource, this.onProposalsState);
        this.addEventListener("submit", this.onSubmit, true);
        this.syncLoginNavigation();
    }

    disconnectedCallback(): void {
        this.stopPolicy?.();
        this.stopPolicy = null;
        this.stopProposals?.();
        this.stopProposals = null;
        this.removeEventListener("submit", this.onSubmit, true);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            refreshSourceContext(this.policySource);
        }
    }

    private readonly onProposalsState = (state: SourceObservation): void => {
        if (!state.disposed) {
            refreshSourceContext(this.policySource);
        }
    };

    private readonly onPolicyState = (state: SourceObservation): void => {
        if (!state.disposed) {
            this.syncLoginNavigation();
        }
    };

    private readonly onSubmit = (event: Event): void => {
        const form = event.target instanceof HTMLFormElement ? event.target : null;
        if (!form || form.getAttribute("cms-source-id") !== "create-proposal") {
            return;
        }
        const policy = readPolicy(readSourceData(this.policySource));
        const amountInput = form.querySelector<HTMLInputElement & { value: string }>('mossa-input[type="number"]');
        const amount = minorUnits(amountInput?.value);
        if (
            !policy ||
            !form.reportValidity() ||
            amount === null ||
            (policy.wholeUnitPrices && amount % 100 !== 0) ||
            amount < policy.minimumAmount ||
            amount > policy.maximumAmount
        ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            amountInput?.focus();
            return;
        }
        const amountField = form.elements.namedItem("amount");
        if (amountField instanceof HTMLInputElement) {
            amountField.value = String(amount);
        }
    };

    private get policySource(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="policy"]')!;
    }

    private get proposalsSource(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="proposals"]')!;
    }

    private syncLoginNavigation(): void {
        const link = this.querySelector<HTMLAnchorElement>('[slot="actions"] a[href], a[slot="actions"][href]');
        const href = link?.getAttribute("href");
        if (!link || !href?.includes("{returnTo}")) {
            return;
        }
        const location = this.ownerDocument.defaultView?.location;
        const returnTo = location ? `${location.pathname}${location.search}${location.hash}` : "/";
        link.setAttribute("href", href.replaceAll("{returnTo}", encodeURIComponent(returnTo)));
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceNegotiationForm);
