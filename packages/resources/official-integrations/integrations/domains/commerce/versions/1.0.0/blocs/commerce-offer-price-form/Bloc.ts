import { Composition } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import { formatMoney, majorToMinor, minorToMajor } from "./money.ts";
import {
    comparableProfileValue,
    parseDate,
    profileFieldReady,
    profileFields,
    PublicError,
    stripeEnrollmentComplete,
    textValue,
    validEmail,
} from "./profile.ts";
import { createAccountToken } from "./stripe-account-token.ts";

const colorGroups = ["card", "field", "button"];
let formInstance = 0;

export class CommerceOfferPriceForm extends Composition {
    static observedAttributes = [
        "account-source-id",
        "activation-copy",
        "activation-title",
        "address-label",
        "auth-source-id",
        "back-label",
        "birth-date-invalid-message",
        "birth-date-label",
        "city-label",
        "consent-prefix",
        "country-label",
        "description",
        "email-label",
        "enrollment-function-id",
        "error-message",
        "field-required-message",
        "first-enrollment-consent-required-message",
        "first-name-label",
        "input-hint",
        "input-label",
        "invalid-message",
        "last-name-label",
        "locale",
        "offer-id",
        "offer-label",
        "offer-param",
        "phone-label",
        "postal-code-label",
        "privacy-link-label",
        "privacy-notice",
        "privacy-url",
        "profile-error-message",
        "profile-summary",
        "range-error-message",
        "range-label",
        "range-message",
        "required-message",
        "seller-terms-label",
        "seller-terms-consent-required-message",
        "seller-terms-url",
        "source-id",
        "source-prefix",
        "stripe-source-id",
        "stripe-consent-prefix",
        "stripe-terms-label",
        "stripe-terms-url",
        "submit-error-message",
        "submit-function-id",
        "submit-label",
        "submitting-label",
        "success-label",
        "success-message",
        "success-title",
        "success-url",
        "technical-message",
        "technical-retry-label",
        "technical-title",
        "terms-update-copy",
        "terms-update-title",
        "title",
        "unavailable-message",
        "unavailable-title",
        ...colorGroups.flatMap((group) =>
            ["text", "background", "border", "accent"].map((color) => `${group}-${color}-color`),
        ),
    ];

    constructor() {
        super({ template });
        this.offer = null;
        this.enrollment = null;
        this.profile = null;
        this.enrollmentRequired = false;
        this.termsConsentRequired = false;
        this.activationRequired = false;
        this.pending = false;
        this.clientConfigPromise = null;
        this.validationPrefix = `commerce-offer-price-${++formInstance}`;
    }

    connectedCallback() {
        super.connectedCallback();
        this.form.addEventListener("submit", this.onSubmit);
        this.amount.addEventListener("input", this.onAmountInput);
        this.consent.addEventListener("change", this.onConsentChange);
        for (const retry of this.querySelectorAll("[data-retry]")) {
            retry.addEventListener("click", this.onRetry);
        }
        this.connectValidationMessages();
        this.syncPresentation();
        this.load();
    }

    disconnectedCallback() {
        this.form.removeEventListener("submit", this.onSubmit);
        this.amount.removeEventListener("input", this.onAmountInput);
        this.consent.removeEventListener("change", this.onConsentChange);
        for (const retry of this.querySelectorAll("[data-retry]")) {
            retry.removeEventListener("click", this.onRetry);
        }
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) {
            return;
        }
        if (name === "stripe-source-id" || name === "source-prefix") {
            this.clientConfigPromise = null;
        }
        if (!this.templateReady) {
            return;
        }
        this.syncPresentation();
        if (this.offer && name === "locale") {
            this.renderOffer();
        }
        if (["offer-id", "offer-param", "source-id", "enrollment-function-id"].includes(name)) {
            this.load();
        }
    }

    async load() {
        this.show("loading");
        this.error.hidden = true;
        this.validation.textContent = "";
        this.profileValidation.textContent = "";
        this.consentValidation.textContent = "";
        const id = this.offerId;
        if (!id) {
            this.showTechnical(
                this.text(
                    "technical-message",
                    "Impossible de retrouver cette annonce. Retourne à tes annonces puis réessaie.",
                ),
            );
            return;
        }
        try {
            this.offer = await this.request(`myOffer?id=${encodeURIComponent(id)}`);
            if (this.offer?.workflowState !== "awaiting_seller_price") {
                this.show("unavailable");
                return;
            }
            if (!this.validRule) {
                this.showTechnical(
                    this.text(
                        "technical-message",
                        "La plage de prix de cette annonce est momentanément indisponible. Réessaie dans quelques instants.",
                    ),
                );
                return;
            }

            this.enrollment = await this.requestFunction(this.enrollmentFunctionId);
            const connect = this.enrollment?.connect || this.enrollment;
            this.enrollmentRequired = !stripeEnrollmentComplete(connect);
            this.termsConsentRequired =
                this.enrollmentRequired || connect?.marketplaceTermsCurrentVersionAccepted !== true;
            this.activationRequired = this.enrollmentRequired || this.termsConsentRequired;
            if (this.enrollmentRequired) {
                await this.loadActivationProfile();
            } else {
                this.profile = null;
            }
            this.renderActivationState();

            this.renderOffer();
            this.show("card");
        } catch {
            this.showTechnical(
                this.text(
                    "technical-message",
                    "Impossible de charger cette annonce pour le moment. Réessaie dans quelques instants.",
                ),
            );
        }
    }

    async loadActivationProfile() {
        const [accountProfile, currentAccount] = await Promise.all([
            this.requestSource(this.accountSourceId, "getAccount"),
            this.requestSource(this.authSourceId, "me"),
        ]);
        this.profile = {
            ...accountProfile,
            givenName: textValue(accountProfile?.givenName),
            surname: textValue(accountProfile?.surname),
            birthDate: textValue(accountProfile?.birthDate),
            email: textValue(currentAccount?.subject?.email) || textValue(accountProfile?.email),
            phone: textValue(accountProfile?.phone),
            addressLine1: textValue(accountProfile?.addressLine1),
            postalCode: textValue(accountProfile?.postalCode),
            city: textValue(accountProfile?.city),
            countryCode: "FR",
        };
        this.prefillActivationProfile();
    }

    renderActivationState() {
        this.profilePanel.hidden = !this.enrollmentRequired;
        this.consentPanel.hidden = !this.termsConsentRequired;
        this.activationPanel.hidden = !this.activationRequired;
        this.stripeConsentFragment.hidden = !this.enrollmentRequired;
        if (this.termsConsentRequired) {
            this.consent.checked = false;
            this.consent.removeAttribute("aria-invalid");
        }
        const termsOnly = this.termsConsentRequired && !this.enrollmentRequired;
        this.activationTitle.textContent = termsOnly
            ? this.text("terms-update-title", "Accepte les nouvelles conditions vendeur")
            : this.text("activation-title", "Active ton compte vendeur");
        this.activationCopy.textContent = termsOnly
            ? this.text(
                  "terms-update-copy",
                  "Lis et accepte la version actuelle des conditions vendeur pour envoyer ton prix.",
              )
            : this.text(
                  "activation-copy",
                  "Ces informations sont nécessaires pour publier ton annonce et recevoir le produit de tes ventes plus tard. Aucun compte bancaire n’est demandé ici.",
              );
    }

    prefillActivationProfile() {
        if (!this.profile) {
            return;
        }
        for (const field of profileFields) {
            const control = this.profileControl(field);
            if (!control) {
                continue;
            }
            control.value = this.profile[field] || "";
            control.hidden = profileFieldReady(field, control.value);
        }
        this.profileSummary.textContent = this.text(
            "profile-summary",
            "Seules les informations manquantes sont demandées ici. Les autres sont reprises depuis ton profil.",
        );
    }

    renderOffer() {
        const rule = this.offer?.priceRule;
        if (!rule) {
            return;
        }
        this.offerTitle.textContent = this.offer.title || this.text("offer-label", "Annonce");
        this.range.textContent = `${formatMoney(rule.minimumAmount, rule.currency, this.locale)} – ${formatMoney(rule.maximumAmount, rule.currency, this.locale)}`;
        this.amount.setAttribute("min", minorToMajor(rule.minimumAmount));
        this.amount.setAttribute("max", minorToMajor(rule.maximumAmount));
        if (!String(this.amount.value || "").trim()) {
            const draft = this.readPriceDraft();
            if (draft) {
                this.amount.value = draft;
            }
        }
    }

    onAmountInput = () => {
        this.writePriceDraft(this.amount.value);
        const error = this.priceError();
        this.validation.textContent = error;
        this.amount.toggleAttribute("aria-invalid", Boolean(error));
    };

    onConsentChange = () => {
        if (!this.consent.checked) {
            return;
        }
        this.consentValidation.textContent = "";
        this.consent.removeAttribute("aria-invalid");
    };

    onSubmit = async (event) => {
        event.preventDefault();
        if (this.pending || !this.offer) {
            return;
        }

        const priceValidation = this.priceError(true);
        this.validation.textContent = priceValidation;
        this.amount.toggleAttribute("aria-invalid", Boolean(priceValidation));
        if (priceValidation) {
            return;
        }

        let activationProfile = null;
        if (this.enrollmentRequired) {
            activationProfile = this.activationProfile();
            if (!activationProfile) {
                return;
            }
        }
        if (this.termsConsentRequired) {
            if (!this.consent.checked) {
                const message = this.enrollmentRequired
                    ? this.text(
                          "first-enrollment-consent-required-message",
                          "Tu dois accepter les conditions vendeur Courtside et l’accord Stripe pour continuer.",
                      )
                    : this.text(
                          "seller-terms-consent-required-message",
                          "Tu dois accepter les conditions vendeur Courtside pour continuer.",
                      );
                this.consentValidation.textContent = message;
                this.consent.setAttribute("aria-invalid", "true");
                this.consent.focus();
                return;
            }
        }

        const amount = majorToMinor(this.amount.value);
        this.setPending(true);
        this.error.hidden = true;
        try {
            const payload = {
                offerId: String(this.offer.id),
                amount,
                expectedVersion: this.offer.version,
            };
            if (activationProfile) {
                await this.updateProfileIfNecessary(activationProfile);
                const config = await this.clientConfig();
                payload.accountToken = await this.createAccountToken(config.publishableKey, activationProfile);
            }
            if (this.termsConsentRequired) {
                payload.sellerTermsAccepted = true;
            }
            await this.requestFunction(this.submitFunctionId, {
                method: "POST",
                body: JSON.stringify(payload),
            });
            this.clearPriceDraft();
            this.show("success");
            this.dispatchEvent(
                new CustomEvent("commerce-offer-price:submitted", {
                    bubbles: true,
                    composed: true,
                    detail: { offerId: this.offer.id, amount },
                }),
            );
        } catch (error) {
            this.showInlineError(
                error instanceof PublicError
                    ? error.message
                    : this.text(
                          "submit-error-message",
                          "Impossible d’envoyer ton prix pour le moment. Vérifie tes informations puis réessaie.",
                      ),
            );
        } finally {
            this.setPending(false);
        }
    };

    activationProfile() {
        this.profileValidation.textContent = "";
        let valid = true;
        for (const field of profileFields) {
            const control = this.profileControl(field);
            if (typeof control?.reportValidity === "function" && !control.reportValidity()) {
                valid = false;
            }
            if (!textValue(control?.value)) {
                valid = false;
            }
        }
        if (!valid) {
            this.profileValidation.textContent = this.text(
                "field-required-message",
                "Complète tous les champs obligatoires pour continuer.",
            );
            return null;
        }

        const profile = Object.fromEntries(
            profileFields.map((field) => [field, textValue(this.profileControl(field)?.value)]),
        );
        profile.email = textValue(this.profile?.email);
        profile.countryCode = profile.countryCode.toUpperCase();
        if (profile.countryCode !== "FR") {
            this.profileValidation.textContent = this.text(
                "profile-error-message",
                "L’activation est actuellement réservée aux vendeurs domiciliés en France.",
            );
            return null;
        }
        if (!validEmail(profile.email)) {
            this.profileValidation.textContent = this.text(
                "profile-error-message",
                "Indique une adresse e-mail valide.",
            );
            this.profileControl("email")?.focus();
            return null;
        }
        try {
            parseDate(profile.birthDate);
        } catch (error) {
            this.profileValidation.textContent =
                error instanceof PublicError
                    ? error.message
                    : this.text("profile-error-message", "Vérifie les informations de ton profil.");
            this.profileControl("birthDate")?.focus();
            return null;
        }
        return profile;
    }

    async updateProfileIfNecessary(profile) {
        const update = {
            givenName: profile.givenName,
            surname: profile.surname,
            birthDate: profile.birthDate,
            phone: profile.phone,
            addressLine1: profile.addressLine1,
            postalCode: profile.postalCode,
            city: profile.city,
            countryCode: profile.countryCode,
        };
        const changed = Object.entries(update).some(
            ([field, value]) =>
                comparableProfileValue(field, this.profile?.[field]) !== comparableProfileValue(field, value),
        );
        if (!changed) {
            return;
        }
        await this.requestSource(this.accountSourceId, "updateAccount", {
            method: "POST",
            body: JSON.stringify(update),
        });
        this.profile = { ...this.profile, ...update, email: profile.email };
    }

    async createAccountToken(publishableKey, profile) {
        return createAccountToken(publishableKey, profile);
    }

    async clientConfig() {
        if (!this.clientConfigPromise) {
            this.clientConfigPromise = this.requestSource(this.stripeSourceId, "getConnectClientConfig")
                .then((config) => {
                    if (typeof config.publishableKey !== "string" || !config.publishableKey.startsWith("pk_")) {
                        throw new Error("Stripe publishable key is missing");
                    }
                    return config;
                })
                .catch((error) => {
                    this.clientConfigPromise = null;
                    throw error;
                });
        }
        return this.clientConfigPromise;
    }

    priceError(required = false) {
        const raw = textValue(this.amount.value);
        if (!raw) {
            return required ? this.text("required-message", "Indique un prix.") : "";
        }
        const amount = majorToMinor(raw);
        const rule = this.offer?.priceRule;
        if (!Number.isSafeInteger(amount) || amount < 0) {
            return this.text("invalid-message", "Indique un montant valide.");
        }
        if (rule && (amount < rule.minimumAmount || amount > rule.maximumAmount)) {
            return this.text(
                "range-error-message",
                `Choisis un prix entre ${formatMoney(rule.minimumAmount, rule.currency, this.locale)} et ${formatMoney(rule.maximumAmount, rule.currency, this.locale)}.`,
            );
        }
        return "";
    }

    setPending(pending) {
        this.pending = pending;
        this.submit.toggleAttribute("disabled", pending);
        this.amount.toggleAttribute("disabled", pending);
        this.consent.toggleAttribute("disabled", pending);
        for (const control of this.profileControls) {
            control.toggleAttribute("disabled", pending);
        }
        this.submit.textContent = pending
            ? this.text("submitting-label", "Envoi…")
            : this.text("submit-label", "Envoyer mon prix");
    }

    showInlineError(message) {
        this.error.textContent = message;
        this.error.hidden = false;
    }

    showTechnical(message) {
        this.technicalMessage.textContent = message;
        this.show("technical");
    }

    show(state) {
        this.loading.hidden = state !== "loading";
        this.card.hidden = state !== "card";
        this.unavailable.hidden = state !== "unavailable";
        this.technical.hidden = state !== "technical";
        this.success.hidden = state !== "success";
    }

    syncPresentation() {
        // Attributes can be replayed while the CMS is still hydrating the
        // composition template. The connected element exists at that point,
        // but its template nodes do not yet; connectedCallback will call this
        // method again once the form is ready.
        if (!this.templateReady) {
            return;
        }
        this.titleElement.textContent = this.text("title", "Définir mon prix");
        this.descriptionElement.textContent = this.text(
            "description",
            "Choisis ton prix de vente dans la plage proposée.",
        );
        this.offerLabel.textContent = this.text("offer-label", "Annonce");
        this.rangeLabel.textContent = this.text("range-label", "Plage de prix proposée");
        this.rangeMessage.textContent = this.text("range-message", "Ton prix doit être compris dans cette plage.");
        this.amount.setAttribute("label", this.text("input-label", "Ton prix"));
        this.amount.setAttribute("hint", this.text("input-hint", "Montant en euros"));
        if (!this.activationRequired) {
            this.activationTitle.textContent = this.text("activation-title", "Active ton compte vendeur");
            this.activationCopy.textContent = this.text(
                "activation-copy",
                "Ces informations sont nécessaires pour publier ton annonce et recevoir le produit de tes ventes plus tard. Aucun compte bancaire n’est demandé ici.",
            );
        }
        this.profileSummary.textContent = this.text(
            "profile-summary",
            "Seules les informations manquantes sont demandées ici. Les autres sont reprises depuis ton profil.",
        );
        this.setProfileLabel("givenName", "first-name-label", "Prénom");
        this.setProfileLabel("surname", "last-name-label", "Nom");
        this.setProfileLabel("birthDate", "birth-date-label", "Date de naissance");
        this.profileControl("birthDate")?.setAttribute(
            "invalid-date-message",
            this.text("birth-date-invalid-message", "Indique une date au format JJ/MM/AAAA."),
        );
        this.setProfileLabel("email", "email-label", "Adresse e-mail");
        this.setProfileLabel("phone", "phone-label", "Téléphone");
        this.setProfileLabel("addressLine1", "address-label", "Adresse");
        this.setProfileLabel("postalCode", "postal-code-label", "Code postal");
        this.setProfileLabel("city", "city-label", "Ville");
        this.setProfileLabel("countryCode", "country-label", "Pays");
        this.consentPrefix.textContent = this.text("consent-prefix", "J’accepte les");
        this.sellerTermsLink.textContent = this.text("seller-terms-label", "conditions vendeur Courtside");
        this.sellerTermsLink.setAttribute("href", this.getAttribute("seller-terms-url") || "/cgu-cgv");
        this.stripeConsentPrefix.textContent = this.text("stripe-consent-prefix", "et l’");
        this.stripeTermsLink.textContent = this.text("stripe-terms-label", "accord de compte connecté Stripe");
        this.stripeTermsLink.setAttribute(
            "href",
            this.getAttribute("stripe-terms-url") || "https://stripe.com/connect-account/legal",
        );
        this.privacyNotice.textContent = this.text(
            "privacy-notice",
            "Les informations renseignées sont traitées pour activer ton compte vendeur et sécuriser les paiements.",
        );
        this.privacyLink.textContent = this.text("privacy-link-label", "Consulter l’avis de confidentialité");
        this.privacyLink.setAttribute("href", this.getAttribute("privacy-url") || "/mentions-legales");
        this.submit.textContent = this.pending
            ? this.text("submitting-label", "Envoi…")
            : this.text("submit-label", "Envoyer mon prix");
        this.unavailableTitle.textContent = this.text("unavailable-title", "Cette action n’est pas disponible");
        this.unavailableMessage.textContent = this.text(
            "unavailable-message",
            "Cette annonce ne nécessite plus de proposition de prix.",
        );
        this.technicalTitle.textContent = this.text("technical-title", "Impossible de charger le prix");
        this.technicalMessage.textContent = this.text(
            "technical-message",
            "Impossible de charger cette annonce pour le moment. Réessaie dans quelques instants.",
        );
        this.technicalRetry.textContent = this.text("technical-retry-label", "Réessayer");
        this.successTitle.textContent = this.text("success-title", "Prix envoyé");
        this.successMessage.textContent = this.text(
            "success-message",
            "Ta proposition a bien été transmise et va maintenant être vérifiée.",
        );
        this.back.textContent = this.text("back-label", "Retour à mes annonces");
        this.successLink.textContent = this.text("success-label", "Retour à mes annonces");
        const url = this.getAttribute("success-url") || "/mon-espace/mes-annonces";
        this.back.setAttribute("href", url);
        this.successLink.setAttribute("href", url);
        for (const element of this.querySelectorAll("[data-card-surface]")) {
            copyColors(this, element, "card");
        }
        for (const element of [this.amount, ...this.profileControls]) {
            copyColors(this, element, "field");
        }
        for (const element of [this.submit, this.back, this.successLink, this.technicalRetry]) {
            copyColors(this, element, "button");
        }
    }

    connectValidationMessages() {
        this.validation.id = `${this.validationPrefix}-amount-error`;
        this.amount.setAttribute("aria-describedby", this.validation.id);
        this.profileValidation.id = `${this.validationPrefix}-profile-error`;
        for (const control of this.profileControls) {
            control.setAttribute("aria-describedby", this.profileValidation.id);
        }
        this.consentValidation.id = `${this.validationPrefix}-consent-error`;
        this.consent.setAttribute("aria-describedby", this.consentValidation.id);
    }

    setProfileLabel(field, attribute, fallback) {
        this.profileControl(field)?.setAttribute("label", this.text(attribute, fallback));
    }

    onRetry = () => {
        if (!this.pending) {
            this.load();
        }
    };

    readPriceDraft() {
        try {
            return sessionStorage.getItem(this.priceDraftKey) || "";
        } catch {
            return "";
        }
    }

    writePriceDraft(value) {
        try {
            const draft = textValue(value);
            if (draft) {
                sessionStorage.setItem(this.priceDraftKey, draft);
            } else {
                sessionStorage.removeItem(this.priceDraftKey);
            }
        } catch {
            // Storage may be unavailable in privacy-restricted browsing contexts.
        }
    }

    clearPriceDraft() {
        try {
            sessionStorage.removeItem(this.priceDraftKey);
        } catch {
            // Storage may be unavailable in privacy-restricted browsing contexts.
        }
    }

    async request(endpoint, init = {}) {
        const response = await fetch(`${this.sourceBase}/${endpoint}`, {
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
            throw new Error(body?.error || body?.message || this.text("error-message", "Une erreur est survenue."));
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error(this.text("error-message", "Réponse invalide."));
        }
        return body;
    }

    async requestSource(sourceId, endpoint, init = {}) {
        const response = await fetch(
            `${this.sourcePrefix}/${encodeURIComponent(sourceId)}/${encodeURIComponent(endpoint)}`,
            {
                credentials: "include",
                ...init,
                headers: {
                    accept: "application/json",
                    ...(init.body ? { "content-type": "application/json" } : {}),
                    ...headersObject(init.headers),
                },
            },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(body?.error || body?.message || this.text("error-message", "Une erreur est survenue."));
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error(this.text("error-message", "Réponse invalide."));
        }
        return body;
    }

    async requestFunction(id, init = {}) {
        return this.requestSource("system-functions", id, init);
    }

    text(attribute, fallback) {
        return this.getAttribute(attribute)?.trim() || fallback;
    }
    profileControl(field) {
        return this.querySelector(`[data-profile-control="${field}"]`);
    }
    get offerId() {
        return (
            this.getAttribute("offer-id")?.trim() ||
            new URL(location.href).searchParams.get(this.getAttribute("offer-param") || "id") ||
            ""
        );
    }
    get sourcePrefix() {
        return (this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
    }
    get sourceBase() {
        return `${this.sourcePrefix}/${encodeURIComponent(this.getAttribute("source-id") || "commerce")}`;
    }
    get accountSourceId() {
        return this.getAttribute("account-source-id")?.trim() || "user-account";
    }
    get authSourceId() {
        return this.getAttribute("auth-source-id")?.trim() || "system-auth";
    }
    get stripeSourceId() {
        return this.getAttribute("stripe-source-id")?.trim() || "stripe-connect";
    }
    get enrollmentFunctionId() {
        return this.getAttribute("enrollment-function-id")?.trim() || "getSellerSaleEnrollment";
    }
    get submitFunctionId() {
        return this.getAttribute("submit-function-id")?.trim() || "submitSellerOfferPrice";
    }
    get locale() {
        return this.getAttribute("locale") || "fr-FR";
    }
    get validRule() {
        const rule = this.offer?.priceRule;
        return (
            Number.isSafeInteger(rule?.minimumAmount) &&
            Number.isSafeInteger(rule?.maximumAmount) &&
            rule.maximumAmount >= rule.minimumAmount
        );
    }
    get priceDraftKey() {
        return `commerce-offer-price:${this.offerId}`;
    }
    get templateReady() {
        return Boolean(this.loading && this.card && this.unavailable && this.technical && this.success && this.form);
    }
    get loading() {
        return this.querySelector("[data-loading]");
    }
    get card() {
        return this.querySelector("[data-card]");
    }
    get unavailable() {
        return this.querySelector("[data-unavailable]");
    }
    get technical() {
        return this.querySelector("[data-technical]");
    }
    get success() {
        return this.querySelector("[data-success]");
    }
    get error() {
        return this.querySelector("[data-error]");
    }
    get form() {
        return this.querySelector("[data-form]");
    }
    get amount() {
        return this.querySelector("[data-amount]");
    }
    get submit() {
        return this.querySelector("[data-submit]");
    }
    get validation() {
        return this.querySelector("[data-validation]");
    }
    get activationPanel() {
        return this.querySelector("[data-activation-panel]");
    }
    get profilePanel() {
        return this.querySelector("[data-profile-panel]");
    }
    get consentPanel() {
        return this.querySelector("[data-consent-panel]");
    }
    get activationTitle() {
        return this.querySelector("[data-activation-title]");
    }
    get activationCopy() {
        return this.querySelector("[data-activation-copy]");
    }
    get profileSummary() {
        return this.querySelector("[data-profile-summary]");
    }
    get profileValidation() {
        return this.querySelector("[data-profile-validation]");
    }
    get profileControls() {
        return [...this.querySelectorAll("[data-profile-control]")];
    }
    get consent() {
        return this.querySelector("[data-consent]");
    }
    get consentValidation() {
        return this.querySelector("[data-consent-validation]");
    }
    get consentPrefix() {
        return this.querySelector("[data-consent-prefix]");
    }
    get sellerTermsLink() {
        return this.querySelector("[data-seller-terms-link]");
    }
    get stripeConsentFragment() {
        return this.querySelector("[data-stripe-consent-fragment]");
    }
    get stripeConsentPrefix() {
        return this.querySelector("[data-stripe-consent-prefix]");
    }
    get stripeTermsLink() {
        return this.querySelector("[data-stripe-terms-link]");
    }
    get privacyNotice() {
        return this.querySelector("[data-privacy-notice]");
    }
    get privacyLink() {
        return this.querySelector("[data-privacy-link]");
    }
    get titleElement() {
        return this.querySelector("[data-title]");
    }
    get descriptionElement() {
        return this.querySelector("[data-description]");
    }
    get offerLabel() {
        return this.querySelector("[data-offer-label]");
    }
    get offerTitle() {
        return this.querySelector("[data-offer-title]");
    }
    get rangeLabel() {
        return this.querySelector("[data-range-label]");
    }
    get range() {
        return this.querySelector("[data-range]");
    }
    get rangeMessage() {
        return this.querySelector("[data-range-message]");
    }
    get unavailableTitle() {
        return this.querySelector("[data-unavailable-title]");
    }
    get unavailableMessage() {
        return this.querySelector("[data-unavailable-message]");
    }
    get technicalTitle() {
        return this.querySelector("[data-technical-title]");
    }
    get technicalMessage() {
        return this.querySelector("[data-technical-message]");
    }
    get technicalRetry() {
        return this.querySelector("[data-technical-retry]");
    }
    get successTitle() {
        return this.querySelector("[data-success-title]");
    }
    get successMessage() {
        return this.querySelector("[data-success-message]");
    }
    get back() {
        return this.querySelector("[data-back]");
    }
    get successLink() {
        return this.querySelector("[data-success-link]");
    }
}

function headersObject(headers) {
    return headers ? Object.fromEntries(new Headers(headers).entries()) : {};
}

function copyColors(source, target, prefix) {
    if (!target) {
        return;
    }
    for (const name of ["text-color", "background-color", "border-color", "accent-color"]) {
        const value = source.getAttribute(`${prefix}-${name}`)?.trim();
        if (value) {
            target.setAttribute(name, value);
        } else {
            target.removeAttribute(name);
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferPriceForm);
