const STRIPE_JS_URL = "https://js.stripe.com/v3/";
const STRIPE_V2_API = "https://api.stripe.com/v2";
const STRIPE_V2_VERSION = "2026-06-24.dahlia";

const endpointPaths = {
    enrollConnectSeller: "/.cms/sources/stripe-connect/enrollConnectSeller",
    getAccount: "/.cms/sources/user-account/getAccount",
    getConnectClientConfig: "/.cms/sources/stripe-connect/getConnectClientConfig",
    getConnectStatus: "/.cms/sources/stripe-connect/getConnectStatus",
    getConnectWallet: "/.cms/sources/stripe-connect/getConnectWallet",
    submitConnectVerification: "/.cms/sources/stripe-connect/submitConnectVerification",
};

let stripeJsLoader = null;

class StripeConnectOnboarding extends HTMLElement {
    static get observedAttributes() {
        return [
            "title",
            "copy",
            "activation-title",
            "activation-copy",
            "button-label",
            "missing-title",
            "profile-link-label",
            "ready-copy",
            "email-label",
            "iban-label",
            "privacy-copy",
            "security-copy",
            "available-label",
            "pending-label",
            "marketplace-consent-text",
            "marketplace-terms-label",
            "payment-terms-label",
            "terms-update-title",
            "terms-update-copy",
            "terms-update-button-label",
            "terms-unavailable-copy",
            "eyebrow",
            "locale",
            "payout-currency",
        ];
    }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.profile = null;
        this.marketplaceTermsRequirement = null;
        this.marketplaceTermsRequired = false;
        this.clientConfigPromise = null;
    }

    connectedCallback() {
        this.render();
        this.syncPresentation();
        this.activateButton.addEventListener("click", this.onActivate);
        this.form.addEventListener("submit", this.onSubmit);
        this.termsForm.addEventListener("submit", this.onTermsSubmit);
        if (isFramed()) {
            this.showActivation();
            this.setStatus("Payout activation is available on the published page.", "idle");
            return;
        }
        this.refresh().catch((error) => this.showError(error));
    }

    disconnectedCallback() {
        this.activateButton?.removeEventListener("click", this.onActivate);
        this.form?.removeEventListener("submit", this.onSubmit);
        this.termsForm?.removeEventListener("submit", this.onTermsSubmit);
    }

    attributeChangedCallback() {
        if (this.isConnected && this.root.childNodes.length) {
            this.syncPresentation();
        }
    }

    onActivate = () => {
        this.prepareActivation().catch((error) => this.showError(error));
    };

    onSubmit = (event) => {
        event.preventDefault();
        this.submit().catch((error) => this.showError(error));
    };

    onTermsSubmit = (event) => {
        event.preventDefault();
        this.submitMarketplaceTermsAcceptance().catch((error) => this.showError(error));
    };

    render() {
        this.root.innerHTML = `
            <style>
                :host {
                    --_mossa-wallet-accent: var(--ulvia-secondary-base);
                    --_mossa-wallet-accent-text: var(--ulvia-secondary-contrasted);
                    display: block;
                    color: currentColor;
                    font: inherit;
                }
                * { box-sizing: border-box; }
                .shell, .header, .activation, .wallet, .loading, form, .field, .balances { display: grid; }
                .shell {
                    gap: 1.25rem;
                    overflow: hidden;
                    padding: clamp(1.1rem, 3vw, 1.65rem);
                    border: 1px solid var(--ulvia-surface-border);
                    border-radius: var(--ulvia-radius-card);
                    background: var(--ulvia-surface-background);
                    box-shadow: var(--ulvia-shadow-soft);
                }
                .shell.wallet-only {
                    gap: 0;
                    overflow: visible;
                    padding: 0;
                    border: 0;
                    border-radius: 0;
                    background: transparent;
                    box-shadow: none;
                }
                .header, .activation, .wallet, form { gap: .9rem; }
                .field, .balances { gap: .45rem; }
                h2, h3, p { margin: 0; }
                h2 { font-size: clamp(1.25rem, 2.5vw, 1.65rem); }
                h3 { font-size: 1rem; }
                .muted, .hint { color: color-mix(in srgb, currentColor 68%, transparent); }
                .hint { font-size: .875rem; }
                .eyebrow {
                    width: max-content;
                    padding: .3rem .55rem;
                    border-radius: 999px;
                    color: var(--_mossa-wallet-accent);
                    background: color-mix(in srgb, var(--_mossa-wallet-accent) 10%, transparent);
                    font-size: .78rem;
                    font-weight: 800;
                    letter-spacing: .04em;
                    text-transform: uppercase;
                }
                label { font-size: .925rem; font-weight: 650; }
                input[type="text"], input[type="email"] {
                    width: 100%;
                    padding: .7rem .75rem;
                    border: 1px solid var(--ulvia-surface-border);
                    border-radius: var(--ulvia-radius-control);
                    color: currentColor;
                    background: var(--ulvia-surface-background);
                    font: inherit;
                }
                input[type="text"]:focus, input[type="email"]:focus {
                    border-color: transparent;
                    outline: 2px solid var(--_mossa-wallet-accent);
                    outline-offset: 1px;
                }
                .check {
                    display: grid;
                    grid-template-columns: auto 1fr;
                    gap: .65rem;
                    align-items: start;
                    font-weight: 400;
                }
                .check input { width: 1rem; height: 1rem; margin-top: .15rem; accent-color: var(--_mossa-wallet-accent); }
                ::slotted(a) { color: var(--_mossa-wallet-accent); }
                button {
                    width: max-content;
                    padding: .72rem 1rem;
                    border: 0;
                    border-radius: var(--ulvia-radius-control);
                    color: var(--_mossa-wallet-accent-text);
                    background: var(--_mossa-wallet-accent);
                    font: inherit;
                    font-weight: 750;
                    cursor: pointer;
                }
                button:disabled { cursor: wait; opacity: .65; }
                button:hover:not(:disabled) { filter: brightness(.96); }
                .activation {
                    padding: clamp(1rem, 3vw, 1.35rem);
                    border: 1px solid color-mix(in srgb, var(--_mossa-wallet-accent) 24%, transparent);
                    border-radius: var(--ulvia-radius-control);
                    background: color-mix(in srgb, var(--_mossa-wallet-accent) 6%, var(--ulvia-surface-background));
                }
                .status, .missing {
                    padding: .75rem .85rem;
                    border-radius: var(--ulvia-radius-control);
                    background: color-mix(in srgb, currentColor 5%, transparent);
                }
                .status[data-state="error"], .missing {
                    color: var(--ulvia-danger-base);
                    background: color-mix(in srgb, var(--ulvia-danger-base) 8%, transparent);
                }
                .status[data-state="success"] {
                    color: var(--_mossa-wallet-accent);
                    background: color-mix(in srgb, var(--_mossa-wallet-accent) 8%, transparent);
                }
                .balance {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: .35rem 1rem;
                    min-height: 10rem;
                    padding: clamp(1.15rem, 4vw, 1.6rem);
                    border: 0;
                    border-radius: var(--ulvia-radius-card);
                    color: var(--_mossa-wallet-accent-text);
                    background: linear-gradient(135deg, var(--_mossa-wallet-accent), color-mix(in srgb, var(--_mossa-wallet-accent) 76%, var(--ulvia-surface-text)));
                    box-shadow: var(--ulvia-shadow-lg);
                }
                .balance strong { align-self: center; font-size: clamp(1.8rem, 7vw, 2.65rem); }
                .balance .pending { grid-column: 1 / -1; }
                .balance .muted { color: color-mix(in srgb, var(--_mossa-wallet-accent-text) 76%, transparent); }
                .balance button {
                    grid-column: 1 / -1;
                    align-self: end;
                    color: var(--_mossa-wallet-accent);
                    background: var(--_mossa-wallet-accent-text);
                }
                .loading {
                    grid-template-columns: 1fr auto;
                    gap: 1.25rem 1rem;
                    min-height: 10rem;
                    padding: clamp(1.15rem, 4vw, 1.6rem);
                    overflow: hidden;
                    border-radius: var(--ulvia-radius-card);
                    background: color-mix(in srgb, var(--_mossa-wallet-accent) 16%, var(--ulvia-surface-background));
                    box-shadow: var(--ulvia-shadow-soft);
                    animation: wallet-skeleton-pulse 1.25s ease-in-out infinite alternate;
                }
                .loading mossa-skeleton {
                    display: block;
                    border-radius: var(--ulvia-radius-sm);
                    background: color-mix(in srgb, var(--_mossa-wallet-accent) 24%, transparent);
                }
                .loading-label { width: min(12rem, 42vw); height: 1rem; }
                .loading-amount { width: min(8rem, 30vw); height: 2.65rem; }
                .loading-pending { grid-column: 1 / -1; width: min(9rem, 35vw); height: 1rem; }
                .loading-button { grid-column: 1 / -1; align-self: end; width: 9rem; height: 2.7rem; }
                @keyframes wallet-skeleton-pulse {
                    from { opacity: .58; }
                    to { opacity: 1; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .loading { animation: none; }
                }
                .security { display: flex; gap: .5rem; align-items: flex-start; font-size: .875rem; }
                [hidden] { display: none !important; }
            </style>
            <section class="shell">
                <div class="header" data-header>
                    <span class="eyebrow" data-eyebrow></span>
                    <h2 data-title></h2>
                    <p class="muted" data-copy></p>
                </div>
                <p class="status" data-status hidden aria-live="polite"></p>
                <div class="loading" data-loading hidden role="status" aria-label="Loading seller account">
                    <mossa-skeleton class="loading-label" animation="none" aria-hidden="true"></mossa-skeleton>
                    <mossa-skeleton class="loading-amount" animation="none" aria-hidden="true"></mossa-skeleton>
                    <mossa-skeleton class="loading-pending" animation="none" aria-hidden="true"></mossa-skeleton>
                    <mossa-skeleton class="loading-button" animation="none" aria-hidden="true"></mossa-skeleton>
                </div>
                <div class="activation" data-activation hidden>
                    <h3 data-activation-title></h3>
                    <p class="muted" data-activation-copy></p>
                    <button type="button" data-activate></button>
                </div>
                <div class="missing" data-missing hidden>
                    <strong data-missing-title></strong>
                    <p data-missing-copy></p>
                    <slot name="profile-link"></slot>
                </div>
                <form data-form hidden novalidate>
                    <p data-ready-copy></p>
                    <div class="field">
                        <label for="seller-email" data-email-label></label>
                        <input id="seller-email" name="email" type="email" autocomplete="email" required>
                    </div>
                    <div class="field">
                        <label for="iban" data-iban-label></label>
                        <input id="iban" name="iban" type="text" autocomplete="off" placeholder="FR76 …" required>
                        <p class="hint" data-privacy-copy></p>
                    </div>
                    <label class="check">
                        <input type="checkbox" name="marketplaceTermsAccepted" autocomplete="off" required>
                        <span data-marketplace-consent data-link-slot="marketplace-activation-terms">
                            <span data-consent-before></span><slot name="marketplace-activation-terms"></slot><span data-consent-after></span>
                        </span>
                    </label>
                    <label class="check">
                        <input type="checkbox" name="paymentTermsAccepted" autocomplete="off" required>
                        <span>I accept the <slot name="payment-terms"></slot>.</span>
                    </label>
                    <div class="security">
                        <span aria-hidden="true">🔒</span>
                        <span data-security-copy></span>
                    </div>
                    <button type="submit" data-submit>Configure my seller account</button>
                </form>
                <form data-terms-form hidden novalidate>
                    <h3 data-terms-update-title></h3>
                    <p class="muted" data-terms-update-copy></p>
                    <label class="check">
                        <input type="checkbox" name="marketplaceTermsAccepted" autocomplete="off" required>
                        <span data-marketplace-consent data-link-slot="marketplace-update-terms">
                            <span data-consent-before></span><slot name="marketplace-update-terms"></slot><span data-consent-after></span>
                        </span>
                    </label>
                    <button type="submit" data-terms-submit></button>
                </form>
                <div class="missing" data-terms-unavailable hidden role="alert">
                    <strong data-terms-unavailable-title>Seller terms unavailable</strong>
                    <p data-terms-unavailable-copy></p>
                </div>
                <div class="wallet" data-wallet hidden>
                    <div class="balances" data-balances></div>
                </div>
            </section>
        `;
    }

    syncPresentation() {
        this.setText("[data-title]", "title", "Seller account");
        this.setText("[data-eyebrow]", "eyebrow", "Versements");
        this.setText("[data-copy]", "copy", "Activate and monitor your seller account to receive sale payouts.");
        this.setText("[data-activation-title]", "activation-title", "Activate my seller account");
        this.setText(
            "[data-activation-copy]",
            "activation-copy",
            "Configure your seller account in a few steps to receive future payouts.",
        );
        this.setText("[data-activate]", "button-label", "Configure my seller account");
        this.setText("[data-submit]", "button-label", "Configure my seller account");
        this.setText("[data-missing-title]", "missing-title", "Your profile is incomplete");
        this.setText("[data-profile-link]", "profile-link-label", "Complete my profile");
        this.setText("[data-payment-terms]", "payment-terms-label", "payment service terms");
        this.setText("[data-terms-update-title]", "terms-update-title", "Seller terms update");
        this.setText(
            "[data-terms-update-copy]",
            "terms-update-copy",
            "Accept the current platform seller terms to keep selling and receiving payouts.",
        );
        this.setText("[data-terms-submit]", "terms-update-button-label", "Accept and continue");
        this.setText(
            "[data-terms-unavailable-copy]",
            "terms-unavailable-copy",
            "Seller terms are temporarily unavailable. Try again shortly.",
        );
        this.setText(
            "[data-ready-copy]",
            "ready-copy",
            "Your profile is complete. Enter the bank account that should receive payouts.",
        );
        this.setText("[data-email-label]", "email-label", "Email address");
        this.setText("[data-iban-label]", "iban-label", "Payout-account IBAN");
        this.setText(
            "[data-privacy-copy]",
            "privacy-copy",
            "We do not store your IBAN. It is sent securely to configure your payouts.",
        );
        this.setText("[data-security-copy]", "security-copy", "Your information is verified securely.");
        const publishedRequirement = publishedMarketplaceTermsRequirement(this.marketplaceTermsRequirement);
        const marketplaceLabel =
            publishedRequirement?.label || this.getAttribute("marketplace-terms-label")?.trim() || "platform terms";
        const marketplaceConsentText =
            publishedRequirement?.consentText ||
            this.getAttribute("marketplace-consent-text")?.trim() ||
            `I accept the ${marketplaceLabel}.`;
        for (const container of this.root.querySelectorAll("[data-marketplace-consent]")) {
            const link = this.querySelector(`:scope > a[slot="${container.dataset.linkSlot}"]`);
            const marketplaceTermsUrl = publishedRequirement?.page.path || link?.getAttribute("href")?.trim() || "";
            renderLinkedConsent(container, link, marketplaceConsentText, marketplaceLabel, marketplaceTermsUrl);
        }
    }

    setText(selector, attribute, fallback) {
        const element = this.root.querySelector(selector) || this.querySelector(selector);
        if (element) {
            element.textContent = providerNeutralCopy(this.getAttribute(attribute)) || fallback;
        }
    }

    async refresh() {
        this.showLoading();
        this.setBusy(true);
        try {
            const status = await this.requestStripeSource("getConnectStatus");
            this.marketplaceTermsRequirement = marketplaceTermsRequirement(status?.marketplaceTermsRequirement);
            this.marketplaceTermsRequired = status?.marketplaceTermsCurrentVersionAccepted !== true;
            this.syncPresentation();
            this.dispatchEvent(
                new CustomEvent("mossa-stripe-connect-onboarding:status", {
                    bubbles: true,
                    composed: true,
                    detail: status,
                }),
            );
            if (status.onboardingStatus === "enabled" && status.payoutsEnabled === true) {
                if (this.marketplaceTermsRequired) {
                    this.showMarketplaceTermsUpdate();
                    return;
                }
                await this.showWallet();
                return;
            }
            if (verificationPending(status)) {
                this.showPendingVerification();
                return;
            }
            if (!this.marketplaceTermsRequirement) {
                this.showMarketplaceTermsUnavailable();
                return;
            }
            this.showActivation();
            if (status.onboardingStatus === "requirements_due") {
                this.setStatus("More information is required. Check your profile first.", "error");
            } else if (status.onboardingStatus === "rejected") {
                this.setStatus("Your payout account could not be verified.", "error");
            } else {
                this.clearStatus();
            }
        } catch (error) {
            this.hidePanels();
            this.header.hidden = false;
            throw error;
        } finally {
            this.setBusy(false);
        }
    }

    async prepareActivation() {
        if (!this.marketplaceTermsRequirement) {
            this.showMarketplaceTermsUnavailable();
            return;
        }
        this.setBusy(true);
        this.setStatus("Checking your profile…", "idle");
        try {
            const profile = await this.requestAccountSource("getAccount");
            const missing = missingProfileFields(profile);
            if (missing.length) {
                this.profile = null;
                this.activationPanel.hidden = true;
                this.form.hidden = true;
                this.missingPanel.hidden = false;
                this.missingCopy.textContent = `Complete the following information: ${missing.join(", ")}.`;
                this.setStatus("Complete your profile before activating payouts.", "error");
                return;
            }
            this.profile = normalizedProfile(profile);
            this.emailInput.value = text(profile.email);
            this.activationPanel.hidden = true;
            this.missingPanel.hidden = true;
            this.form.hidden = false;
            this.clearStatus();
            this.ibanInput.focus();
        } finally {
            this.setBusy(false);
        }
    }

    async submit() {
        if (!this.marketplaceTermsRequirement) {
            this.showMarketplaceTermsUnavailable();
            return;
        }
        if (!this.profile) {
            await this.prepareActivation();
            return;
        }
        if (!this.form.reportValidity()) {
            return;
        }
        const marketplaceTermsAccepted = this.activationMarketplaceTermsInput.checked;
        const paymentTermsAccepted = this.paymentTermsInput.checked;
        const profile = { ...this.profile, email: this.emailInput.value.trim() };
        this.setBusy(true);
        this.setStatus("Sending your information securely…", "idle");
        try {
            const config = await this.clientConfig();
            const birthDate = parseDate(profile.birthDate);
            const accountToken = await this.createAccountToken(config.publishableKey, {
                contact_email: profile.email,
                display_name: `${profile.givenName} ${profile.surname}`,
                identity: {
                    entity_type: "individual",
                    individual: {
                        given_name: profile.givenName,
                        surname: profile.surname,
                        email: profile.email,
                        phone: profile.phone,
                        date_of_birth: birthDate,
                        address: {
                            country: profile.countryCode.toLowerCase(),
                            line1: profile.addressLine1,
                            ...(profile.addressLine2 ? { line2: profile.addressLine2 } : {}),
                            postal_code: profile.postalCode,
                            city: profile.city,
                        },
                    },
                    attestations: {
                        terms_of_service: { account: { shown_and_accepted: paymentTermsAccepted } },
                    },
                },
            });
            const bankAccountToken = await this.createBankAccountToken(config.publishableKey, {
                account_holder_name: `${profile.givenName} ${profile.surname}`,
                account_holder_type: "individual",
                country: profile.countryCode.toUpperCase(),
                currency: this.payoutCurrency.toLowerCase(),
                account_number: this.ibanInput.value.replace(/\s/g, "").toUpperCase(),
            });
            const marketplaceTerms = this.marketplaceTermsRequirement;
            let status;
            try {
                status = await this.requestStripeSource("submitConnectVerification", {
                    method: "POST",
                    body: JSON.stringify({
                        accountToken,
                        bankAccountToken,
                        contactEmail: profile.email,
                        ...(marketplaceTerms
                            ? {
                                  marketplaceTermsAccepted,
                                  expectedMarketplaceTermsVersion: marketplaceTerms.version,
                                  expectedMarketplaceTermsHash: marketplaceTerms.hash,
                              }
                            : {}),
                    }),
                });
            } catch (error) {
                if (error instanceof Error && error.message === "MARKETPLACE_TERMS_VERSION_CHANGED") {
                    this.activationMarketplaceTermsInput.checked = false;
                    this.paymentTermsInput.checked = false;
                    await this.refresh();
                    throw new PublicError("Seller terms changed. Review the new version before continuing.");
                }
                throw error;
            }
            this.ibanInput.value = "";
            this.activationMarketplaceTermsInput.checked = false;
            this.paymentTermsInput.checked = false;
            if (status.onboardingStatus === "enabled" && status.payoutsEnabled === true) {
                if (status.marketplaceTermsCurrentVersionAccepted === true) {
                    await this.showWallet();
                } else {
                    await this.refresh();
                }
            } else {
                this.showPendingVerification();
            }
        } finally {
            this.setBusy(false);
        }
    }

    async submitMarketplaceTermsAcceptance() {
        const marketplaceTerms = this.marketplaceTermsRequirement;
        if (!marketplaceTerms) {
            this.showMarketplaceTermsUnavailable();
            return;
        }
        if (!this.termsForm.reportValidity()) {
            return;
        }
        this.setBusy(true);
        this.setStatus("Saving your acceptance…", "idle");
        try {
            let status;
            try {
                status = await this.requestStripeSource("enrollConnectSeller", {
                    method: "POST",
                    body: JSON.stringify({
                        marketplaceTermsAccepted: true,
                        expectedMarketplaceTermsVersion: marketplaceTerms.version,
                        expectedMarketplaceTermsHash: marketplaceTerms.hash,
                    }),
                });
            } catch (error) {
                if (error instanceof Error && error.message === "MARKETPLACE_TERMS_VERSION_CHANGED") {
                    this.termsAcceptanceInput.checked = false;
                    await this.refresh();
                    throw new PublicError("Seller terms changed. Review the new version before continuing.");
                }
                throw error;
            }
            this.termsAcceptanceInput.checked = false;
            if (
                status.marketplaceTermsCurrentVersionAccepted === true &&
                status.onboardingStatus === "enabled" &&
                status.payoutsEnabled === true
            ) {
                await this.showWallet();
            } else {
                this.showPendingVerification();
            }
        } finally {
            this.setBusy(false);
        }
    }

    async showWallet() {
        const wallet = await this.requestStripeSource("getConnectWallet");
        this.hidePanels();
        this.shell.classList.add("wallet-only");
        this.header.hidden = true;
        this.walletPanel.hidden = false;
        this.balances.replaceChildren();
        const balances = Array.isArray(wallet.balances) ? wallet.balances : [];
        const displayedBalances = balances.length
            ? balances
            : [{ currency: this.payoutCurrency, available: 0, pending: 0 }];
        for (const balance of displayedBalances) {
            this.balances.append(
                walletBalance(
                    balance,
                    {
                        available: this.getAttribute("available-label")?.trim() || "Available balance",
                        pending: this.getAttribute("pending-label")?.trim() || "Pending",
                    },
                    this.locale,
                ),
            );
        }
        this.clearStatus();
    }

    showActivation() {
        this.hidePanels();
        this.header.hidden = false;
        this.activationPanel.hidden = false;
    }

    showPendingVerification() {
        this.hidePanels();
        this.header.hidden = false;
        this.setStatus(
            "Verification pending. Your information is being reviewed and this may take a few minutes.",
            "idle",
        );
    }

    showMarketplaceTermsUpdate() {
        this.hidePanels();
        this.header.hidden = false;
        if (!this.marketplaceTermsRequirement) {
            this.showMarketplaceTermsUnavailable();
            return;
        }
        this.termsAcceptanceInput.checked = false;
        this.termsForm.hidden = false;
        this.clearStatus();
    }

    showMarketplaceTermsUnavailable() {
        this.hidePanels();
        this.header.hidden = false;
        this.termsUnavailablePanel.hidden = false;
        this.clearStatus();
    }

    showLoading() {
        this.hidePanels();
        this.shell.classList.add("wallet-only");
        this.header.hidden = true;
        this.clearStatus();
        this.loadingPanel.hidden = false;
    }

    hidePanels() {
        this.shell.classList.remove("wallet-only");
        this.loadingPanel.hidden = true;
        this.activationPanel.hidden = true;
        this.missingPanel.hidden = true;
        this.form.hidden = true;
        this.termsForm.hidden = true;
        this.termsUnavailablePanel.hidden = true;
        this.walletPanel.hidden = true;
    }

    setBusy(busy) {
        this.activateButton.disabled = busy;
        this.submitButton.disabled = busy;
        this.termsSubmitButton.disabled = busy;
        for (const button of this.root.querySelectorAll(".balance button")) {
            button.disabled = busy || button.dataset.empty === "true";
        }
    }

    setStatus(message, state) {
        this.status.hidden = !message;
        this.status.textContent = message;
        this.status.dataset.state = state;
    }

    clearStatus() {
        this.setStatus("", "idle");
    }

    showError(error) {
        this.setBusy(false);
        this.loadingPanel.hidden = true;
        this.shell.classList.remove("wallet-only");
        this.header.hidden = false;
        this.setStatus(publicErrorMessage(error), "error");
    }

    async createAccountToken(publishableKey, payload) {
        const response = await fetch(`${STRIPE_V2_API}/core/account_tokens`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${publishableKey}`,
                "content-type": "application/json",
                "stripe-version": STRIPE_V2_VERSION,
            },
            body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || typeof body?.id !== "string") {
            throw new PublicError("This information could not be verified.");
        }
        return body.id;
    }

    async createBankAccountToken(publishableKey, payload) {
        const Stripe = await loadStripeJs();
        const result = await Stripe(publishableKey).createToken("bank_account", payload);
        if (result.error || typeof result.token?.id !== "string") {
            throw new PublicError("This IBAN could not be verified.");
        }
        return result.token.id;
    }

    async clientConfig() {
        if (!this.clientConfigPromise) {
            this.clientConfigPromise = this.requestStripeSource("getConnectClientConfig").then((config) => {
                if (typeof config.publishableKey !== "string" || !config.publishableKey.startsWith("pk_")) {
                    throw new Error("Stripe publishable key is missing");
                }
                return config;
            });
        }
        return this.clientConfigPromise;
    }

    requestStripeSource(endpoint, init = {}) {
        return this.requestSource(endpoint, init);
    }

    requestAccountSource(endpoint, init = {}) {
        return this.requestSource(endpoint, init);
    }

    async requestSource(endpoint, init = {}) {
        const path = endpointPaths[endpoint];
        if (!path) {
            throw new Error(`Undeclared seller endpoint: ${endpoint}`);
        }
        const response = await fetch(path, {
            credentials: "include",
            ...init,
            headers: {
                accept: "application/json",
                ...(init.body ? { "content-type": "application/json" } : {}),
                ...headersObject(init.headers),
            },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            const message =
                body && typeof body === "object" && "error" in body
                    ? String(body.error)
                    : `${response.status} ${response.statusText}`;
            throw new Error(message);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Invalid source response");
        }
        return body;
    }

    get activateButton() {
        return this.root.querySelector("[data-activate]");
    }
    get submitButton() {
        return this.root.querySelector("[data-submit]");
    }
    get termsSubmitButton() {
        return this.root.querySelector("[data-terms-submit]");
    }
    get status() {
        return this.root.querySelector("[data-status]");
    }
    get loadingPanel() {
        return this.root.querySelector("[data-loading]");
    }
    get activationPanel() {
        return this.root.querySelector("[data-activation]");
    }
    get missingPanel() {
        return this.root.querySelector("[data-missing]");
    }
    get missingCopy() {
        return this.root.querySelector("[data-missing-copy]");
    }
    get form() {
        return this.root.querySelector("[data-form]");
    }
    get termsForm() {
        return this.root.querySelector("[data-terms-form]");
    }
    get termsUnavailablePanel() {
        return this.root.querySelector("[data-terms-unavailable]");
    }
    get activationMarketplaceTermsInput() {
        return this.form.querySelector("[name='marketplaceTermsAccepted']");
    }
    get paymentTermsInput() {
        return this.form.querySelector("[name='paymentTermsAccepted']");
    }
    get termsAcceptanceInput() {
        return this.termsForm.querySelector("[name='marketplaceTermsAccepted']");
    }
    get ibanInput() {
        return this.root.querySelector("[name='iban']");
    }
    get emailInput() {
        return this.root.querySelector("[name='email']");
    }
    get walletPanel() {
        return this.root.querySelector("[data-wallet]");
    }
    get shell() {
        return this.root.querySelector(".shell");
    }
    get balances() {
        return this.root.querySelector("[data-balances]");
    }
    get header() {
        return this.root.querySelector("[data-header]");
    }

    get locale() {
        return this.getAttribute("locale")?.trim() || "en-US";
    }

    get payoutCurrency() {
        return (this.getAttribute("payout-currency")?.trim() || "USD").toUpperCase();
    }
}

const profileFields = [
    { property: "givenName", label: "first name" },
    { property: "surname", label: "last name" },
    { property: "birthDate", label: "birth date" },
    { property: "phone", label: "phone number" },
    { property: "addressLine1", label: "address" },
    { property: "postalCode", label: "postal code" },
    { property: "city", label: "city" },
    { property: "countryCode", label: "country" },
];

function missingProfileFields(profile) {
    return profileFields.filter((field) => !text(profile?.[field.property])).map((field) => field.label);
}

function normalizedProfile(profile) {
    return {
        ...Object.fromEntries(profileFields.map((field) => [field.property, text(profile[field.property])])),
        addressLine2: text(profile.addressLine2),
    };
}

function walletBalance(balance, labels, locale) {
    const currency = text(balance?.currency).toUpperCase() || "USD";
    const element = document.createElement("div");
    element.className = "balance";
    const label = document.createElement("span");
    label.textContent = `${labels.available} · ${currency}`;
    const available = document.createElement("strong");
    available.textContent = money(balance?.available, currency, locale);
    const pending = document.createElement("span");
    pending.className = "pending muted";
    pending.textContent = `${labels.pending} · ${money(balance?.pending, currency, locale)}`;
    element.append(label, available, pending);
    return element;
}

function money(value, currency, locale) {
    const amount = Number.isSafeInteger(Number(value)) ? Number(value) / 100 : 0;
    try {
        return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        throw new PublicError("The profile birth date must use the YYYY-MM-DD format.");
    }
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function loadStripeJs() {
    if (typeof window.Stripe === "function") {
        return Promise.resolve(window.Stripe);
    }
    if (stripeJsLoader) {
        return stripeJsLoader;
    }
    stripeJsLoader = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${STRIPE_JS_URL}"]`);
        const script = existing || document.createElement("script");
        script.addEventListener(
            "load",
            () => {
                if (typeof window.Stripe === "function") {
                    resolve(window.Stripe);
                } else {
                    reject(new PublicError("The secure payment service is unavailable."));
                }
            },
            { once: true },
        );
        script.addEventListener(
            "error",
            () => reject(new PublicError("The secure payment service could not be loaded.")),
            { once: true },
        );
        if (!existing) {
            script.src = STRIPE_JS_URL;
            script.async = true;
            document.head.append(script);
        }
    });
    return stripeJsLoader;
}

function headersObject(headers) {
    return headers ? Object.fromEntries(new Headers(headers).entries()) : {};
}

function text(value) {
    return typeof value === "string" ? value.trim() : "";
}

function providerNeutralCopy(value) {
    return text(value)
        .replace(/Stripe Connect/gi, "payment service")
        .replace(/Stripe/gi, "payment service");
}

function verificationPending(status) {
    const providerPending =
        status?.onboardingStatus === "pending_verification" ||
        status?.bankPayoutsStatus === "pending" ||
        (Array.isArray(status?.pendingVerification) && status.pendingVerification.length > 0);
    if (providerPending) {
        return true;
    }
    const actionRequired = ["requirements_due", "rejected"].includes(status?.onboardingStatus);
    return status?.bankAccountStatus === "attached" && status?.payoutsEnabled !== true && !actionRequired;
}

function renderLinkedConsent(container, link, consentText, documentLabel, documentUrl) {
    if (!(link instanceof HTMLAnchorElement)) {
        return;
    }
    if (documentUrl) {
        link.href = documentUrl;
    } else {
        link.removeAttribute("href");
    }
    link.textContent = documentLabel;
    const start = consentText.toLocaleLowerCase().indexOf(documentLabel.toLocaleLowerCase());
    const before = container.querySelector("[data-consent-before]");
    const after = container.querySelector("[data-consent-after]");
    if (start < 0) {
        before.textContent = `${consentText} `;
        after.textContent = "";
        return;
    }
    before.textContent = consentText.slice(0, start);
    after.textContent = consentText.slice(start + documentLabel.length);
}

function marketplaceTermsRequirement(value) {
    const version = text(value?.version);
    const hash = text(value?.hash).toLowerCase();
    if (!version || version.length > 200 || !/^[a-f0-9]{64}$/.test(hash)) {
        return null;
    }
    const requirement = { version, hash };
    const published = publishedMarketplaceTermsRequirement(value);
    if (value?.mode === "published_page") {
        return published ? { ...requirement, ...published } : null;
    }
    if (value?.mode !== "legacy") {
        return null;
    }
    return requirement;
}

function publishedMarketplaceTermsRequirement(value) {
    const pagePath = text(value?.page?.path);
    const label = text(value?.label);
    const consentText = text(value?.consentText);
    if (value?.mode !== "published_page" || !pagePath.startsWith("/") || !label || !consentText) {
        return null;
    }
    return {
        mode: "published_page",
        label,
        consentText,
        page: { path: pagePath },
    };
}

function publicErrorMessage(error) {
    if (error instanceof PublicError) {
        return error.message;
    }
    return "Something went wrong. Try again shortly.";
}

class PublicError extends Error {}

function isFramed() {
    try {
        return window.top !== window.self;
    } catch {
        return true;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", StripeConnectOnboarding);
