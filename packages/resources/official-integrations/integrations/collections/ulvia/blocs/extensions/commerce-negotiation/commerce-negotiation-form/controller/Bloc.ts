import { Component } from "@bernouy/components/base";

const orchestratedEndpoints = new Set(["getProposalPolicy", "createMyProposal"]);

export class CommerceNegotiationForm extends Component {
    static observedAttributes = [
        "amount-hint",
        "amount-label",
        "appearance",
        "button-accent-color",
        "button-background-color",
        "button-border-color",
        "button-label",
        "button-text-color",
        "card-background-color",
        "card-border-color",
        "card-muted-text-color",
        "card-text-color",
        "copy",
        "current-label",
        "density",
        "error-message",
        "existing-message",
        "field-accent-color",
        "field-background-color",
        "field-border-color",
        "field-text-color",
        "locale",
        "message-hint",
        "message-label",
        "message-placeholder",
        "offer-id",
        "range-label",
        "own-offer-message",
        "skeleton-base-color",
        "skeleton-highlight-color",
        "show-message",
        "source-id",
        "source-prefix",
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
        if (["offer-id", "source-id", "source-prefix"].includes(name) && !isFramed()) {
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
                throw new Error("Les propositions sont temporairement désactivées.");
            }
            if (policy.canPropose === false) {
                const message =
                    policy.ineligibilityReason === "own_offer"
                        ? this.getAttribute("own-offer-message") ||
                          "Vous ne pouvez pas faire une offre sur votre propre annonce."
                        : this.getAttribute("unavailable-message") ||
                          "Cette annonce n’est pas disponible pour une proposition.";
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
                    this.getAttribute("error-message") || "Impossible de charger les conditions de cette offre.",
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
            currency: "eur",
        };
        this.showContent();
        this.syncPolicy();
    }

    syncPresentation() {
        setText(this.querySelector("[data-title]"), this.getAttribute("title") || "Faire une offre");
        setText(
            this.querySelector("[data-copy]"),
            this.getAttribute("copy") ||
                "Propose un prix au vendeur. Ton offre doit rester dans la fourchette autorisée.",
        );
        setText(this.querySelector("[data-current-label]"), this.getAttribute("current-label") || "Prix actuel");
        setText(this.querySelector("[data-range-label]"), this.getAttribute("range-label") || "Proposition autorisée");
        setText(
            this.querySelector("[data-unavailable]"),
            this.getAttribute("unavailable-message") || "Cette annonce n’est pas disponible pour une proposition.",
        );
        this.syncExistingProposal();

        const card = this.querySelector("[data-card]");
        setAttribute(card, "appearance", this.getAttribute("appearance") || "plain");
        setAttribute(card, "density", this.getAttribute("density") || "regular");
        copyColors(this, card, "card", ["text-color", "background-color", "border-color", "muted-text-color"]);

        const amount = this.amountInput;
        setAttribute(amount, "label", this.getAttribute("amount-label") || "Ton prix (€)");
        setAttribute(
            amount,
            "hint",
            this.getAttribute("amount-hint") || "Saisis un montant compris dans la fourchette indiquée.",
        );
        const message = this.messageInput;
        setHidden(message, this.getAttribute("show-message") === "false");
        setAttribute(message, "label", this.getAttribute("message-label") || "Message au vendeur (facultatif)");
        setAttribute(
            message,
            "hint",
            this.getAttribute("message-hint") || "Tu peux préciser les raisons de ta proposition.",
        );
        setAttribute(
            message,
            "placeholder",
            this.getAttribute("message-placeholder") || "Bonjour, accepterais-tu mon offre ?",
        );
        for (const field of [amount, message]) {
            copyColors(this, field, "field", ["accent-color", "text-color", "background-color", "border-color"]);
        }

        setText(this.submitButton, this.getAttribute("button-label") || "Envoyer mon offre");
        copyColors(this, this.submitButton, "button", [
            "accent-color",
            "text-color",
            "background-color",
            "border-color",
        ]);
        for (const skeleton of this.querySelectorAll("basic-skeleton")) {
            copyAttribute(this, skeleton, "skeleton-base-color", "base-color");
            copyAttribute(this, skeleton, "skeleton-highlight-color", "highlight-color");
        }
        if (this.policy) {
            this.syncPolicy();
        }
    }

    syncPolicy() {
        const policy = this.policy;
        if (!policy) {
            return;
        }
        const locale = this.getAttribute("locale") || "fr-FR";
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
            this.showToast(this.getAttribute("error-message") || "Le montant proposé n’est pas valide.", true);
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
            this.showToast(this.getAttribute("success-message") || "Ton offre a bien été envoyée.", false);
            this.dispatchEvent(
                new CustomEvent("commerce-negotiation:created", {
                    bubbles: true,
                    composed: true,
                    detail: proposal,
                }),
            );
        } catch (error) {
            this.showToast(
                errorMessage(error, this.getAttribute("error-message") || "Impossible d’envoyer ton offre."),
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
            throw new Error("Réponse invalide du service.");
        }
        return body;
    }

    sourceUrl(endpoint) {
        const prefix = (this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
        const sourceId = encodeURIComponent(
            orchestratedEndpoints.has(endpoint)
                ? "system-functions"
                : this.getAttribute("source-id") || "commerce-negotiation",
        );
        return `${prefix}/${sourceId}/${encodeURIComponent(endpoint)}`;
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
            this.getAttribute("locale") || "fr-FR",
            this.policy?.wholeUnitPrices === true,
        );
        const message =
            this.getAttribute("existing-message") || "Vous avez déjà fait une offre de {amount} pour cette annonce.";
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
            this.ownerDocument.createElement("basic-toast");
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
        throw new Error("Les conditions de cette offre sont invalides.");
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

function copyAttribute(source, target, sourceName, targetName = sourceName) {
    if (!target) {
        return;
    }
    const value = source.getAttribute(sourceName)?.trim();
    if (value) {
        target.setAttribute(targetName, value);
    } else {
        target.removeAttribute(targetName);
    }
}

function copyColors(source, target, prefix, names) {
    for (const name of names) {
        copyAttribute(source, target, `${prefix}-${name}`, name);
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
    const message = error instanceof Error ? error.message.trim() : "";
    return isFrenchUserMessage(message) ? message : fallback;
}

function isFrenchUserMessage(value) {
    return (
        Boolean(value) &&
        /[àâçéèêëîïôùûüÿœ]|\b(?:le|la|les|un|une|des|du|de|au|aux|ton|ta|tes|votre|vos|offre|prix|montant|proposition|conditions|annonce|réponse)\b/i.test(
            value,
        )
    );
}

function isFramed() {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceNegotiationForm);
