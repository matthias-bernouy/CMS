const STRIPE_JS_URL = "https://js.stripe.com/v3/";
const STRIPE_V2_API = "https://api.stripe.com/v2";
const STRIPE_V2_VERSION = "2026-06-24.dahlia";

let stripeJsLoader = null;

class StripeConnectOnboarding extends HTMLElement {
    static get observedAttributes() {
        return [
            "accent-color",
            "accent-text-color",
            "title",
            "copy",
            "activation-title",
            "activation-copy",
            "button-label",
            "missing-title",
            "profile-link-label",
            "ready-copy",
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
            this.setStatus("L’activation des versements est disponible sur la page publiée.", "idle");
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
                    --wallet-accent: var(--secondary-base, #b85b24);
                    --wallet-accent-text: var(--secondary-contrasted, #fff);
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
                    border: 1px solid var(--border-default, color-mix(in srgb, currentColor 14%, transparent));
                    border-radius: var(--radius-card, 16px);
                    background: var(--bg-surface, Canvas);
                    box-shadow: 0 10px 30px color-mix(in srgb, currentColor 5%, transparent);
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
                    color: var(--wallet-accent);
                    background: color-mix(in srgb, var(--wallet-accent) 10%, transparent);
                    font-size: .78rem;
                    font-weight: 800;
                    letter-spacing: .04em;
                    text-transform: uppercase;
                }
                label { font-size: .925rem; font-weight: 650; }
                input[type="text"] {
                    width: 100%;
                    padding: .7rem .75rem;
                    border: 1px solid var(--border-default, color-mix(in srgb, currentColor 24%, transparent));
                    border-radius: var(--radius-control, 7px);
                    color: currentColor;
                    background: var(--bg-surface, Canvas);
                    font: inherit;
                }
                input[type="text"]:focus {
                    border-color: transparent;
                    outline: 2px solid var(--wallet-accent);
                    outline-offset: 1px;
                }
                .check {
                    display: grid;
                    grid-template-columns: auto 1fr;
                    gap: .65rem;
                    align-items: start;
                    font-weight: 400;
                }
                .check input { width: 1rem; height: 1rem; margin-top: .15rem; accent-color: var(--wallet-accent); }
                ::slotted(a) { color: var(--wallet-accent); }
                button {
                    width: max-content;
                    padding: .72rem 1rem;
                    border: 0;
                    border-radius: var(--radius-control, 7px);
                    color: var(--wallet-accent-text);
                    background: var(--wallet-accent);
                    font: inherit;
                    font-weight: 750;
                    cursor: pointer;
                }
                button:disabled { cursor: wait; opacity: .65; }
                button:hover:not(:disabled) { filter: brightness(.96); }
                .activation {
                    padding: clamp(1rem, 3vw, 1.35rem);
                    border: 1px solid color-mix(in srgb, var(--wallet-accent) 24%, transparent);
                    border-radius: var(--radius-control, 12px);
                    background: color-mix(in srgb, var(--wallet-accent) 6%, var(--bg-surface, Canvas));
                }
                .status, .missing {
                    padding: .75rem .85rem;
                    border-radius: var(--radius-control, 7px);
                    background: color-mix(in srgb, currentColor 5%, transparent);
                }
                .status[data-state="error"], .missing {
                    color: var(--danger-base, #b42318);
                    background: color-mix(in srgb, var(--danger-base, #b42318) 8%, transparent);
                }
                .status[data-state="success"] {
                    color: var(--wallet-accent);
                    background: color-mix(in srgb, var(--wallet-accent) 8%, transparent);
                }
                .balance {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: .35rem 1rem;
                    min-height: 10rem;
                    padding: clamp(1.15rem, 4vw, 1.6rem);
                    border: 0;
                    border-radius: var(--radius-card, 16px);
                    color: var(--wallet-accent-text);
                    background: linear-gradient(135deg, var(--wallet-accent), color-mix(in srgb, var(--wallet-accent) 76%, #000));
                    box-shadow: 0 14px 28px color-mix(in srgb, var(--wallet-accent) 22%, transparent);
                }
                .balance strong { align-self: center; font-size: clamp(1.8rem, 7vw, 2.65rem); }
                .balance .pending { grid-column: 1 / -1; }
                .balance .muted { color: color-mix(in srgb, var(--wallet-accent-text) 76%, transparent); }
                .balance button {
                    grid-column: 1 / -1;
                    align-self: end;
                    color: var(--wallet-accent);
                    background: var(--wallet-accent-text);
                }
                .loading {
                    grid-template-columns: 1fr auto;
                    gap: 1.25rem 1rem;
                    min-height: 10rem;
                    padding: clamp(1.15rem, 4vw, 1.6rem);
                    overflow: hidden;
                    border-radius: var(--radius-card, 16px);
                    background: color-mix(in srgb, var(--wallet-accent) 16%, var(--bg-surface, Canvas));
                    box-shadow: 0 14px 28px color-mix(in srgb, var(--wallet-accent) 10%, transparent);
                    animation: wallet-skeleton-pulse 1.25s ease-in-out infinite alternate;
                }
                .loading basic-skeleton {
                    display: block;
                    border-radius: var(--radius-sm, .4rem);
                    background: color-mix(in srgb, var(--wallet-accent) 24%, transparent);
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
                <div class="loading" data-loading hidden role="status" aria-label="Chargement du compte vendeur">
                    <basic-skeleton class="loading-label" animation="none" aria-hidden="true"></basic-skeleton>
                    <basic-skeleton class="loading-amount" animation="none" aria-hidden="true"></basic-skeleton>
                    <basic-skeleton class="loading-pending" animation="none" aria-hidden="true"></basic-skeleton>
                    <basic-skeleton class="loading-button" animation="none" aria-hidden="true"></basic-skeleton>
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
                        <span>J’accepte les <slot name="payment-terms"></slot>.</span>
                    </label>
                    <div class="security">
                        <span aria-hidden="true">🔒</span>
                        <span data-security-copy></span>
                    </div>
                    <button type="submit" data-submit>Configurer mon compte vendeur</button>
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
                    <strong data-terms-unavailable-title>Conditions vendeur indisponibles</strong>
                    <p data-terms-unavailable-copy></p>
                </div>
                <div class="wallet" data-wallet hidden>
                    <div class="balances" data-balances></div>
                </div>
            </section>
        `;
    }

    syncPresentation() {
        const accent = this.getAttribute("accent-color")?.trim();
        const accentText = this.getAttribute("accent-text-color")?.trim();
        if (accent) {
            this.style.setProperty("--wallet-accent", accent);
        } else {
            this.style.removeProperty("--wallet-accent");
        }
        if (accentText) {
            this.style.setProperty("--wallet-accent-text", accentText);
        } else {
            this.style.removeProperty("--wallet-accent-text");
        }
        this.setText("[data-title]", "title", "Compte vendeur");
        this.setText("[data-eyebrow]", "eyebrow", "Versements");
        this.setText(
            "[data-copy]",
            "copy",
            "Active et suis ton compte vendeur pour recevoir les versements de tes ventes.",
        );
        this.setText("[data-activation-title]", "activation-title", "Activer mon compte vendeur");
        this.setText(
            "[data-activation-copy]",
            "activation-copy",
            "Configure ton compte vendeur en quelques étapes pour recevoir tes prochains versements.",
        );
        this.setText("[data-activate]", "button-label", "Configurer mon compte vendeur");
        this.setText("[data-submit]", "button-label", "Configurer mon compte vendeur");
        this.setText("[data-missing-title]", "missing-title", "Ton profil est incomplet");
        this.setText("[data-profile-link]", "profile-link-label", "Compléter mon profil");
        this.setText("[data-payment-terms]", "payment-terms-label", "conditions du service de paiement");
        this.setText("[data-terms-update-title]", "terms-update-title", "Mise à jour des conditions vendeur");
        this.setText(
            "[data-terms-update-copy]",
            "terms-update-copy",
            "Pour continuer à vendre et recevoir tes prochains versements, accepte la version actuelle des conditions vendeur de la plateforme.",
        );
        this.setText("[data-terms-submit]", "terms-update-button-label", "Accepter et continuer");
        this.setText(
            "[data-terms-unavailable-copy]",
            "terms-unavailable-copy",
            "Les conditions vendeur sont momentanément indisponibles. Réessaie dans quelques instants.",
        );
        this.setText(
            "[data-ready-copy]",
            "ready-copy",
            "Ton profil est complet. Renseigne le compte bancaire sur lequel recevoir tes versements.",
        );
        this.setText("[data-iban-label]", "iban-label", "IBAN du compte de versement");
        this.setText(
            "[data-privacy-copy]",
            "privacy-copy",
            "Nous ne conservons pas ton IBAN. Il est transmis de manière sécurisée pour configurer tes versements.",
        );
        this.setText("[data-security-copy]", "security-copy", "Tes informations sont vérifiées de manière sécurisée.");
        const publishedRequirement = publishedMarketplaceTermsRequirement(this.marketplaceTermsRequirement);
        const marketplaceLabel =
            publishedRequirement?.label ||
            this.getAttribute("marketplace-terms-label")?.trim() ||
            "conditions générales de la plateforme";
        const marketplaceConsentText =
            publishedRequirement?.consentText ||
            this.getAttribute("marketplace-consent-text")?.trim() ||
            `J’accepte les ${marketplaceLabel}.`;
        for (const container of this.root.querySelectorAll("[data-marketplace-consent]")) {
            const link = this.querySelector(`:scope > a[slot="${container.dataset.linkSlot}"]`);
            const marketplaceTermsUrl =
                publishedRequirement?.page.path || link?.getAttribute("href")?.trim() || "/legal/terms";
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
                new CustomEvent("stripe-connect-onboarding:status", {
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
                this.setStatus(
                    "Des informations supplémentaires sont nécessaires. Vérifie d’abord ton profil.",
                    "error",
                );
            } else if (status.onboardingStatus === "rejected") {
                this.setStatus("Ton compte de versement n’a pas pu être vérifié.", "error");
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
        this.setStatus("Vérification de ton profil…", "idle");
        try {
            const [accountProfile, currentAccount] = await Promise.all([
                this.requestAccountSource("getAccount"),
                this.requestAuthSource("me"),
            ]);
            const profile = {
                ...accountProfile,
                email: text(currentAccount?.subject?.email),
            };
            const missing = missingProfileFields(profile);
            if (missing.length) {
                this.profile = null;
                this.activationPanel.hidden = true;
                this.form.hidden = true;
                this.missingPanel.hidden = false;
                this.missingCopy.textContent = `Complète les informations suivantes : ${missing.join(", ")}.`;
                this.setStatus("Complète ton profil avant d’activer les versements.", "error");
                return;
            }
            if (text(profile.countryCode).toUpperCase() !== "FR") {
                throw new PublicError(
                    "L’activation des versements est actuellement réservée aux profils domiciliés en France.",
                );
            }
            this.profile = normalizedProfile(profile);
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
        this.setBusy(true);
        this.setStatus("Envoi sécurisé de tes informations…", "idle");
        try {
            const config = await this.clientConfig();
            const birthDate = parseDate(this.profile.birthDate);
            const accountToken = await this.createAccountToken(config.publishableKey, {
                contact_email: this.profile.email,
                display_name: `${this.profile.givenName} ${this.profile.surname}`,
                identity: {
                    entity_type: "individual",
                    individual: {
                        given_name: this.profile.givenName,
                        surname: this.profile.surname,
                        email: this.profile.email,
                        phone: this.profile.phone,
                        date_of_birth: birthDate,
                        address: {
                            country: "fr",
                            line1: this.profile.addressLine1,
                            ...(this.profile.addressLine2 ? { line2: this.profile.addressLine2 } : {}),
                            postal_code: this.profile.postalCode,
                            city: this.profile.city,
                        },
                    },
                    attestations: {
                        terms_of_service: { account: { shown_and_accepted: paymentTermsAccepted } },
                    },
                },
            });
            const bankAccountToken = await this.createBankAccountToken(config.publishableKey, {
                account_holder_name: `${this.profile.givenName} ${this.profile.surname}`,
                account_holder_type: "individual",
                country: "FR",
                currency: "eur",
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
                        contactEmail: this.profile.email,
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
                    throw new PublicError(
                        "Les conditions vendeur ont changé. Relis la nouvelle version avant de continuer.",
                    );
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
        this.setStatus("Enregistrement de ton accord…", "idle");
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
                    throw new PublicError(
                        "Les conditions vendeur ont changé. Relis la nouvelle version avant de continuer.",
                    );
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
        const displayedBalances = balances.length ? balances : [{ currency: "eur", available: 0, pending: 0 }];
        for (const balance of displayedBalances) {
            this.balances.append(
                walletBalance(balance, {
                    available: this.getAttribute("available-label")?.trim() || "Solde disponible",
                    pending: this.getAttribute("pending-label")?.trim() || "En attente",
                }),
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
            "Validation en attente. Tes informations sont en cours de vérification. Cela peut prendre quelques minutes.",
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
            throw new PublicError("Ces informations n’ont pas pu être vérifiées.");
        }
        return body.id;
    }

    async createBankAccountToken(publishableKey, payload) {
        const Stripe = await loadStripeJs();
        const result = await Stripe(publishableKey).createToken("bank_account", payload);
        if (result.error || typeof result.token?.id !== "string") {
            throw new PublicError("Cet IBAN n’a pas pu être vérifié.");
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
        return this.requestSource(this.getAttribute("source-id") || "stripe-connect", endpoint, init);
    }

    requestAccountSource(endpoint, init = {}) {
        return this.requestSource(this.getAttribute("account-source-id") || "user-account", endpoint, init);
    }

    requestAuthSource(endpoint, init = {}) {
        return this.requestSource(this.getAttribute("auth-source-id") || "system-auth", endpoint, init);
    }

    async requestSource(sourceId, endpoint, init = {}) {
        const response = await fetch(`/.cms/sources/${encodeURIComponent(sourceId)}/${encodeURIComponent(endpoint)}`, {
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
}

const profileFields = [
    { property: "givenName", label: "prénom" },
    { property: "surname", label: "nom" },
    { property: "birthDate", label: "date de naissance" },
    { property: "email", label: "adresse e-mail" },
    { property: "phone", label: "numéro de téléphone" },
    { property: "addressLine1", label: "adresse" },
    { property: "postalCode", label: "code postal" },
    { property: "city", label: "ville" },
    { property: "countryCode", label: "pays" },
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

function walletBalance(balance, labels) {
    const currency = text(balance?.currency).toUpperCase() || "EUR";
    const element = document.createElement("div");
    element.className = "balance";
    const label = document.createElement("span");
    label.textContent = `${labels.available} · ${currency}`;
    const available = document.createElement("strong");
    available.textContent = money(balance?.available, currency);
    const pending = document.createElement("span");
    pending.className = "pending muted";
    pending.textContent = `${labels.pending} · ${money(balance?.pending, currency)}`;
    element.append(label, available, pending);
    return element;
}

function money(value, currency) {
    const amount = Number.isSafeInteger(Number(value)) ? Number(value) / 100 : 0;
    try {
        return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
    } catch {
        return `${amount.toFixed(2).replace(".", ",")} ${currency}`;
    }
}

function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        throw new PublicError("La date de naissance du profil doit respecter le format AAAA-MM-JJ.");
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
                    reject(new PublicError("Le service de paiement sécurisé est indisponible."));
                }
            },
            { once: true },
        );
        script.addEventListener(
            "error",
            () => reject(new PublicError("Le service de paiement sécurisé n’a pas pu être chargé.")),
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
        .replace(/Compte vendeur Stripe/gi, "Compte vendeur")
        .replace(/Ajoute dans Stripe Connect le compte bancaire/gi, "Renseigne le compte bancaire")
        .replace(/compte Stripe Connect/gi, "compte vendeur")
        .replace(/compte Stripe connecté/gi, "compte vendeur")
        .replace(/compte Stripe/gi, "compte vendeur")
        .replace(/conditions Stripe/gi, "conditions du service de paiement")
        .replace(/Stripe Connect/gi, "service de paiement")
        .replace(/Stripe/gi, "service de paiement");
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
    link.href = documentUrl;
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
    return "Une erreur est survenue. Réessaie dans quelques instants.";
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
