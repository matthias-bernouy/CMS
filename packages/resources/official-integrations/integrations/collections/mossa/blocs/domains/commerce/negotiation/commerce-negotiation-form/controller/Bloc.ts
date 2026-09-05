import { Component } from "@bernouy/components/base";

const endpointPaths = {
    createMyProposal: "/.cms/sources/system-functions/createMyProposal",
    getProposalPolicy: "/.cms/sources/system-functions/getProposalPolicy",
    myProposals: "/.cms/sources/commerce-negotiation/myProposals",
};

export class CommerceNegotiationForm extends Component {
    static observedAttributes = [
        "amount-hint",
        "amount-label",
        "appearance",
        "button-label",
        "copy",
        "current-label",
        "density",
        "error-message",
        "existing-message",
        "locale",
        "message-hint",
        "message-label",
        "message-placeholder",
        "offer-id",
        "range-label",
        "own-offer-message",
        "show-message",
        "success-message",
        "title",
        "unavailable-message",
    ];

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
        this.policy = null;
        this.existingProposal = null;
        this.controller = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this.form?.addEventListener("submit", this.onSubmit);
        this.syncPresentation();
        if (isFramed()) {
            this.showPreview();
        } else {
            void this.loadPolicy();
        }
    }

    disconnectedCallback() {
        this.form?.removeEventListener("submit", this.onSubmit);
        this.controller?.abort();
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) {
            return;
        }
        queueMicrotask(() => this.syncPresentation());
        if (name === "offer-id" && !isFramed()) {
            queueMicrotask(() => void this.loadPolicy());
        }
    }

    async loadPolicy() {
        const offerId = positiveInteger(this.getAttribute("offer-id"));
        this.controller?.abort();
        this.policy = null;
        this.existingProposal = null;
        if (!offerId) {
            this.showUnavailable();
            return;
        }
        const controller = new AbortController();
        this.controller = controller;
        this.showLoading();
        try {
            const [policy, proposals] = await Promise.all([
                this.requestSource("getProposalPolicy", { query: { offerId }, signal: controller.signal }),
                this.requestSource("myProposals", {
                    query: { role: "buyer", status: "pending", offerId, limit: 1 },
                    signal: controller.signal,
                }),
            ]);
            if (controller.signal.aborted) {
                return;
            }
            if (!policy.enabled) {
                throw new Error("Proposals are temporarily disabled.");
            }
            if (policy.canPropose === false) {
                const message =
                    policy.ineligibilityReason === "own_offer"
                        ? this.getAttribute("own-offer-message") || "You cannot submit a proposal on your own offer."
                        : this.getAttribute("unavailable-message") || "This offer is not available for proposals.";
                this.showUnavailable(message);
                return;
            }
            this.policy = validPolicy(policy);
            this.existingProposal = validExistingProposal(proposals, offerId);
            if (this.existingProposal) {
                this.showExisting();
                this.syncExistingProposal();
            } else {
                this.showContent();
                this.syncPolicy();
            }
        } catch (error) {
            if (controller.signal.aborted) {
                return;
            }
            this.showUnavailable();
            this.showToast(
                errorMessage(
                    error,
                    this.getAttribute("error-message") || "The terms for this offer could not be loaded.",
                ),
                true,
            );
        }
    }

    showPreview() {
        this.policy = {
            offerId: 1,
            referenceAmount: 15000,
            minimumAmount: 12000,
            maximumAmount: 18000,
            currency: "usd",
        };
        this.showContent();
        this.syncPolicy();
    }

    syncPresentation() {
        setText(this.querySelector("[data-title]"), this.getAttribute("title") || "Make a proposal");
        setText(
            this.querySelector("[data-copy]"),
            this.getAttribute("copy") || "Propose a price to the seller within the allowed range.",
        );
        setText(this.querySelector("[data-current-label]"), this.getAttribute("current-label") || "Current price");
        setText(this.querySelector("[data-range-label]"), this.getAttribute("range-label") || "Allowed proposal");
        setText(
            this.querySelector("[data-unavailable]"),
            this.getAttribute("unavailable-message") || "This offer is not available for proposals.",
        );
        this.syncExistingProposal();

        const card = this.querySelector("[data-card]");
        setAttribute(card, "appearance", this.getAttribute("appearance") || "plain");
        setAttribute(card, "density", this.getAttribute("density") || "regular");

        const amount = this.amountInput;
        setAttribute(amount, "label", this.getAttribute("amount-label") || "Your price (€)");
        setAttribute(amount, "hint", this.getAttribute("amount-hint") || "Enter an amount within the displayed range.");
        const message = this.messageInput;
        setHidden(message, this.getAttribute("show-message") === "false");
        setAttribute(message, "label", this.getAttribute("message-label") || "Message to seller (optional)");
        setAttribute(message, "hint", this.getAttribute("message-hint") || "You may explain your proposal.");
        setAttribute(
            message,
            "placeholder",
            this.getAttribute("message-placeholder") || "Hello, would you accept my proposal?",
        );
        setText(this.submitButton, this.getAttribute("button-label") || "Submit my proposal");
        if (this.policy) {
            this.syncPolicy();
        }
    }

    syncPolicy() {
        const policy = this.policy;
        if (!policy) {
            return;
        }
        const locale = this.getAttribute("locale") || "en-US";
        setText(
            this.querySelector("[data-current-price]"),
            formatMoney(policy.referenceAmount, policy.currency, locale, policy.wholeUnitPrices),
        );
        setText(
            this.querySelector("[data-range]"),
            `${formatMoney(policy.minimumAmount, policy.currency, locale, policy.wholeUnitPrices)} – ${formatMoney(policy.maximumAmount, policy.currency, locale, policy.wholeUnitPrices)}`,
        );
        setAttribute(this.amountInput, "min", decimalAmount(policy.minimumAmount, policy.wholeUnitPrices));
        setAttribute(this.amountInput, "max", decimalAmount(policy.maximumAmount, policy.wholeUnitPrices));
        setAttribute(this.amountInput, "step", policy.wholeUnitPrices ? "1" : "0.01");
    }

    onSubmit = (event) => {
        event.preventDefault();
        void this.submitProposal();
    };

    async submitProposal() {
        if (!this.policy || !this.form?.reportValidity()) {
            return;
        }
        const amount = minorUnits(this.amountInput?.value);
        if (
            amount === null ||
            (this.policy.wholeUnitPrices && amount % 100 !== 0) ||
            amount < this.policy.minimumAmount ||
            amount > this.policy.maximumAmount
        ) {
            this.showToast(this.getAttribute("error-message") || "The proposed amount is invalid.", true);
            this.amountInput?.focus();
            return;
        }
        this.submitButton.disabled = true;
        try {
            const proposal = await this.requestSource("createMyProposal", {
                method: "POST",
                body: {
                    offerId: this.policy.offerId,
                    amount,
                    ...(this.getAttribute("show-message") === "false"
                        ? {}
                        : { message: this.messageInput?.value?.trim() || undefined }),
                },
            });
            this.amountInput.value = "";
            this.messageInput.value = "";
            this.existingProposal = proposal;
            this.showExisting();
            this.syncExistingProposal();
            this.showToast(this.getAttribute("success-message") || "Your proposal was submitted.", false);
            this.dispatchEvent(
                new CustomEvent("commerce-negotiation:created", {
                    bubbles: true,
                    composed: true,
                    detail: proposal,
                }),
            );
        } catch (error) {
            this.showToast(
                errorMessage(error, this.getAttribute("error-message") || "Your proposal could not be submitted."),
                true,
            );
        } finally {
            this.submitButton.disabled = false;
        }
    }

    async requestSource(endpoint, options = {}) {
        const url = new URL(this.sourceUrl(endpoint), this.ownerDocument.baseURI);
        for (const [name, value] of Object.entries(options.query || {})) {
            url.searchParams.set(name, String(value));
        }
        const response = await fetch(url, {
            credentials: "include",
            method: options.method || "GET",
            signal: options.signal,
            headers: {
                accept: "application/json",
                ...(options.body ? { "content-type": "application/json" } : {}),
            },
            ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(
                body && typeof body.error === "string" ? body.error : `${response.status} ${response.statusText}`,
            );
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Invalid service response.");
        }
        return body;
    }

    sourceUrl(endpoint) {
        const path = endpointPaths[endpoint];
        if (!path) {
            throw new Error(`Undeclared negotiation endpoint: ${endpoint}`);
        }
        return path;
    }

    showLoading() {
        setHidden(this.querySelector("[data-loading]"), false);
        setHidden(this.querySelector("[data-content]"), true);
        setHidden(this.querySelector("[data-existing]"), true);
        setHidden(this.querySelector("[data-unavailable]"), true);
    }

    showContent() {
        setHidden(this.querySelector("[data-loading]"), true);
        setHidden(this.querySelector("[data-content]"), false);
        setHidden(this.querySelector("[data-existing]"), true);
        setHidden(this.querySelector("[data-unavailable]"), true);
    }

    showExisting() {
        setHidden(this.querySelector("[data-loading]"), true);
        setHidden(this.querySelector("[data-content]"), true);
        setHidden(this.querySelector("[data-existing]"), false);
        setHidden(this.querySelector("[data-unavailable]"), true);
    }

    syncExistingProposal() {
        if (!this.existingProposal) {
            return;
        }
        const amount = formatMoney(
            this.existingProposal.proposedAmount,
            this.existingProposal.currency,
            this.getAttribute("locale") || "en-US",
            this.policy?.wholeUnitPrices === true,
        );
        const message =
            this.getAttribute("existing-message") || "You already submitted a proposal of {amount} for this offer.";
        setText(this.querySelector("[data-existing]"), message.replaceAll("{amount}", amount));
    }

    showUnavailable(message) {
        if (message) {
            setText(this.querySelector("[data-unavailable]"), message);
        }
        setHidden(this.querySelector("[data-loading]"), true);
        setHidden(this.querySelector("[data-content]"), true);
        setHidden(this.querySelector("[data-existing]"), true);
        setHidden(this.querySelector("[data-unavailable]"), false);
    }

    showToast(message, error) {
        const toast =
            this.querySelector("[data-toast-template]")?.content.firstElementChild?.cloneNode(true) ??
            this.ownerDocument.createElement("mossa-toast");
        toast.setAttribute("role", error ? "alert" : "status");
        toast.setAttribute("tone", error ? "danger" : "success");
        toast.setAttribute("appearance", "filled");
        toast.textContent = message;
        this.querySelector("[data-toast-region]")?.replaceChildren(toast);
    }

    get form() {
        return this.querySelector("[data-form]");
    }
    get amountInput() {
        return this.querySelector("[data-amount]");
    }
    get messageInput() {
        return this.querySelector("[data-message]");
    }
    get submitButton() {
        return this.querySelector("[data-submit]");
    }
}

function validPolicy(value) {
    const policy = {
        offerId: positiveInteger(value.offerId),
        referenceAmount: safeAmount(value.referenceAmount),
        minimumAmount: safeAmount(value.minimumAmount),
        maximumAmount: safeAmount(value.maximumAmount),
        currency:
            typeof value.currency === "string" && /^[a-z]{3}$/i.test(value.currency)
                ? value.currency.toLowerCase()
                : null,
        wholeUnitPrices: typeof value.wholeUnitPrices === "boolean" ? value.wholeUnitPrices : null,
    };
    if (
        !policy.offerId ||
        policy.referenceAmount === null ||
        policy.minimumAmount === null ||
        policy.maximumAmount === null ||
        !policy.currency ||
        policy.wholeUnitPrices === null ||
        policy.minimumAmount > policy.maximumAmount
    ) {
        throw new Error("The terms for this offer are invalid.");
    }
    return policy;
}

function validExistingProposal(value, offerId) {
    const proposal = Array.isArray(value?.items) ? value.items[0] : null;
    if (!proposal || positiveInteger(proposal.offerId) !== offerId || proposal.status !== "pending") {
        return null;
    }
    const proposedAmount = safeAmount(proposal.proposedAmount);
    const currency =
        typeof proposal.currency === "string" && /^[a-z]{3}$/i.test(proposal.currency)
            ? proposal.currency.toLowerCase()
            : null;
    return proposedAmount === null || !currency ? null : { ...proposal, proposedAmount, currency };
}

function safeAmount(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function positiveInteger(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function minorUnits(value) {
    const text = String(value ?? "")
        .trim()
        .replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
        return null;
    }
    const amount = Math.round(Number(text) * 100);
    return Number.isSafeInteger(amount) ? amount : null;
}

function decimalAmount(value, wholeUnitPrices = false) {
    return wholeUnitPrices ? String(value / 100) : (value / 100).toFixed(2);
}

function formatMoney(amount, currency, locale, wholeUnitPrices = false) {
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: currency.toUpperCase(),
            minimumFractionDigits: wholeUnitPrices ? 0 : undefined,
            maximumFractionDigits: wholeUnitPrices ? 0 : undefined,
        }).format(amount / 100);
    } catch {
        return `${decimalAmount(amount, wholeUnitPrices)} ${currency.toUpperCase()}`;
    }
}

function setText(element, value) {
    if (element && element.textContent !== value) {
        element.textContent = value;
    }
}

function setAttribute(element, name, value) {
    if (element && element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

function setHidden(element, hidden) {
    if (!element) {
        return;
    }
    element.toggleAttribute("hidden", hidden);
    if (hidden) {
        element.style.setProperty("display", "none", "important");
    } else {
        element.style.removeProperty("display");
    }
}

function errorMessage(error, fallback) {
    console.error(error);
    return fallback;
}

function isFramed() {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceNegotiationForm);
