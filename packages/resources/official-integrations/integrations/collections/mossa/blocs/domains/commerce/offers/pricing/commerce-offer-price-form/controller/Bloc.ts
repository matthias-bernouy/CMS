import { Component } from "@bernouy/components/base";

import { formatMoney, majorToMinor, minorToMajor } from "../money.ts";
import {
    comparableProfileValue,
    parseDate,
    profileFieldReady,
    profileFields,
    PublicError,
    stripeEnrollmentComplete,
    textValue,
    validEmail,
} from "../profile.ts";
import { createAccountToken } from "../stripe-account-token.ts";

const endpointPaths = {
    getAccount: "/.cms/sources/user-account/getAccount",
    getConnectClientConfig: "/.cms/sources/stripe-connect/getConnectClientConfig",
    getSellerSaleEnrollment: "/.cms/sources/system-functions/getSellerSaleEnrollment",
    submitSellerOfferPrice: "/.cms/sources/system-functions/submitSellerOfferPrice",
    updateAccount: "/.cms/sources/user-account/updateAccount",
};
let formInstance = 0;

export class CommerceOfferPriceForm extends Component {
    static observedAttributes = [
        "activation-copy",
        "activation-title",
        "address-label",
        "back-label",
        "birth-date-invalid-message",
        "birth-date-label",
        "city-label",
        "consent-prefix",
        "country-label",
        "description",
        "email-label",
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
        "seller-terms-changed-message",
        "seller-terms-consent-required-message",
        "seller-terms-url",
        "stripe-consent-prefix",
        "stripe-terms-label",
        "stripe-terms-url",
        "submit-error-message",
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
        "whole-unit-message",
    ];

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
        this.offer = null;
        this.enrollment = null;
        this.sellerTermsRequirement = null;
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
        if (!this.templateReady) {
            return;
        }
        this.syncPresentation();
        if (this.offer && name === "locale") {
            this.renderOffer();
        }
        if (["offer-id", "offer-param"].includes(name)) {
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
                this.text("technical-message", "This offer could not be found. Return to your offers and try again."),
            );
            return;
        }
        try {
            this.offer = await this.request(`/.cms/sources/commerce/myOffer?id=${encodeURIComponent(id)}`);
            if (this.offer?.workflowState !== "awaiting_seller_price") {
                this.show("unavailable");
                return;
            }
            if (!this.validRule) {
                this.showTechnical(
                    this.text(
                        "technical-message",
                        "The price range for this offer is temporarily unavailable. Try again shortly.",
                    ),
                );
                return;
            }

            this.enrollment = await this.requestFunction("getSellerSaleEnrollment");
            const connect = this.enrollment?.connect || this.enrollment;
            this.sellerTermsRequirement = marketplaceTermsRequirement(connect?.marketplaceTermsRequirement);
            this.enrollmentRequired = !stripeEnrollmentComplete(connect);
            this.termsConsentRequired =
                this.enrollmentRequired || connect?.marketplaceTermsCurrentVersionAccepted !== true;
            this.activationRequired = this.enrollmentRequired || this.termsConsentRequired;
            if (this.enrollmentRequired) {
                await this.loadActivationProfile();
            } else {
                this.profile = null;
            }
            this.syncPresentation();
            this.renderActivationState();

            this.renderOffer();
            this.show("card");
        } catch {
            this.showTechnical(
                this.text("technical-message", "This offer cannot be loaded right now. Try again shortly."),
            );
        }
    }

    async loadActivationProfile() {
        const accountProfile = await this.requestEndpoint("getAccount");
        this.profile = {
            ...accountProfile,
            givenName: textValue(accountProfile?.givenName),
            surname: textValue(accountProfile?.surname),
            birthDate: textValue(accountProfile?.birthDate),
            email: textValue(accountProfile?.email),
            phone: textValue(accountProfile?.phone),
            addressLine1: textValue(accountProfile?.addressLine1),
            postalCode: textValue(accountProfile?.postalCode),
            city: textValue(accountProfile?.city),
            countryCode: textValue(accountProfile?.countryCode).toUpperCase(),
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
            ? this.text("terms-update-title", "Accept the new seller terms")
            : this.text("activation-title", "Activate your seller account");
        this.activationCopy.textContent = termsOnly
            ? this.text("terms-update-copy", "Review and accept the current seller terms to submit your price.")
            : this.text(
                  "activation-copy",
                  "This information is required to publish your offer and receive future sale proceeds. No bank account is requested here.",
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
            "Only missing information is requested here. Existing values come from your profile.",
        );
    }

    renderOffer() {
        const rule = this.offer?.priceRule;
        if (!rule) {
            return;
        }
        this.offerTitle.textContent = this.offer.title || this.text("offer-label", "Offer");
        this.range.textContent = `${formatMoney(rule.minimumAmount, rule.currency, this.locale, this.offer.wholeUnitPrices)} – ${formatMoney(rule.maximumAmount, rule.currency, this.locale, this.offer.wholeUnitPrices)}`;
        this.amount.setAttribute("min", minorToMajor(rule.minimumAmount, this.offer.wholeUnitPrices));
        this.amount.setAttribute("max", minorToMajor(rule.maximumAmount, this.offer.wholeUnitPrices));
        this.amount.setAttribute("step", this.offer.wholeUnitPrices ? "1" : "0.01");
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
                          "Accept the platform seller terms and payment service terms to continue.",
                      )
                    : this.text(
                          "seller-terms-consent-required-message",
                          "Accept the platform seller terms to continue.",
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
                if (this.sellerTermsRequirement) {
                    payload.sellerTermsVersion = this.sellerTermsRequirement.version;
                    payload.sellerTermsHash = this.sellerTermsRequirement.hash;
                }
            }
            await this.requestFunction("submitSellerOfferPrice", {
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
            if (error instanceof Error && error.message === "MARKETPLACE_TERMS_VERSION_CHANGED") {
                await this.load();
                this.showInlineError(
                    this.text(
                        "seller-terms-changed-message",
                        "Seller terms changed. Review the new version before continuing.",
                    ),
                );
                return;
            }
            this.showInlineError(
                error instanceof PublicError
                    ? error.message
                    : this.text(
                          "submit-error-message",
                          "Your price cannot be submitted right now. Check your information and try again.",
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
                "Complete all required fields to continue.",
            );
            return null;
        }

        const profile = Object.fromEntries(
            profileFields.map((field) => [field, textValue(this.profileControl(field)?.value)]),
        );
        profile.countryCode = profile.countryCode.toUpperCase();
        if (!validEmail(profile.email)) {
            this.profileValidation.textContent = this.text("profile-error-message", "Enter a valid email address.");
            this.profileControl("email")?.focus();
            return null;
        }
        try {
            parseDate(profile.birthDate);
        } catch (error) {
            this.profileValidation.textContent =
                error instanceof PublicError
                    ? error.message
                    : this.text("profile-error-message", "Check your profile information.");
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
        await this.requestEndpoint("updateAccount", {
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
            this.clientConfigPromise = this.requestEndpoint("getConnectClientConfig")
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
            return required ? this.text("required-message", "Enter a price.") : "";
        }
        const amount = majorToMinor(raw);
        const rule = this.offer?.priceRule;
        if (!Number.isSafeInteger(amount) || amount < 0) {
            return this.text("invalid-message", "Enter a valid amount.");
        }
        if (this.offer?.wholeUnitPrices && amount % 100 !== 0) {
            return this.text("whole-unit-message", "Enter a whole-unit price.");
        }
        if (rule && (amount < rule.minimumAmount || amount > rule.maximumAmount)) {
            return this.text(
                "range-error-message",
                `Choose a price between ${formatMoney(rule.minimumAmount, rule.currency, this.locale, this.offer?.wholeUnitPrices)} and ${formatMoney(rule.maximumAmount, rule.currency, this.locale, this.offer?.wholeUnitPrices)}.`,
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
            ? this.text("submitting-label", "Submitting…")
            : this.text("submit-label", "Submit my price");
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
        this.titleElement.textContent = this.text("title", "Set my price");
        this.descriptionElement.textContent = this.text(
            "description",
            "Choose a selling price within the proposed range.",
        );
        this.offerLabel.textContent = this.text("offer-label", "Offer");
        this.rangeLabel.textContent = this.text("range-label", "Proposed price range");
        this.rangeMessage.textContent = this.text("range-message", "Your price must be within this range.");
        this.amount.setAttribute("label", this.text("input-label", "Your price"));
        this.amount.setAttribute("hint", this.text("input-hint", "Amount in the offer currency"));
        if (!this.activationRequired) {
            this.activationTitle.textContent = this.text("activation-title", "Activate your seller account");
            this.activationCopy.textContent = this.text(
                "activation-copy",
                "This information is required to publish your offer and receive future sale proceeds. No bank account is requested here.",
            );
        }
        this.profileSummary.textContent = this.text(
            "profile-summary",
            "Only missing information is requested here. Existing values come from your profile.",
        );
        this.setProfileLabel("givenName", "first-name-label", "First name");
        this.setProfileLabel("surname", "last-name-label", "Name");
        this.setProfileLabel("birthDate", "birth-date-label", "Birth date");
        this.profileControl("birthDate")?.setAttribute(
            "invalid-date-message",
            this.text("birth-date-invalid-message", "Enter a date in DD/MM/YYYY format."),
        );
        this.setProfileLabel("email", "email-label", "Email address");
        this.setProfileLabel("phone", "phone-label", "Phone");
        this.setProfileLabel("addressLine1", "address-label", "Address");
        this.setProfileLabel("postalCode", "postal-code-label", "Postal code");
        this.setProfileLabel("city", "city-label", "City");
        this.setProfileLabel("countryCode", "country-label", "Country");
        const publishedTerms = publishedMarketplaceTermsRequirement(this.sellerTermsRequirement);
        const sellerTermsLabel = publishedTerms?.label || this.text("seller-terms-label", "platform seller terms");
        renderLinkedConsent(
            this.sellerConsent,
            publishedTerms?.consentText || `${this.text("consent-prefix", "I accept the")} ${sellerTermsLabel}.`,
            sellerTermsLabel,
            publishedTerms?.page.path || this.getAttribute("seller-terms-url") || "",
        );
        this.stripeConsentPrefix.textContent = this.text("stripe-consent-prefix", "I accept the");
        this.stripeTermsLink.textContent = this.text("stripe-terms-label", "payment service terms");
        this.stripeTermsLink.setAttribute(
            "href",
            this.getAttribute("stripe-terms-url") || "https://stripe.com/connect-account/legal",
        );
        this.privacyNotice.textContent = this.text(
            "privacy-notice",
            "The information provided is processed to activate your seller account and secure payments.",
        );
        this.privacyLink.textContent = this.text("privacy-link-label", "Read the privacy notice");
        const privacyUrl = this.getAttribute("privacy-url")?.trim() || "";
        this.privacyLink.toggleAttribute("hidden", !privacyUrl);
        if (privacyUrl) {
            this.privacyLink.setAttribute("href", privacyUrl);
        } else {
            this.privacyLink.removeAttribute("href");
        }
        this.submit.textContent = this.pending
            ? this.text("submitting-label", "Submitting…")
            : this.text("submit-label", "Submit my price");
        this.unavailableTitle.textContent = this.text("unavailable-title", "This action is unavailable");
        this.unavailableMessage.textContent = this.text(
            "unavailable-message",
            "This offer no longer requires a price proposal.",
        );
        this.technicalTitle.textContent = this.text("technical-title", "Price could not be loaded");
        this.technicalMessage.textContent = this.text(
            "technical-message",
            "This offer cannot be loaded right now. Try again shortly.",
        );
        this.technicalRetry.textContent = this.text("technical-retry-label", "Try again");
        this.successTitle.textContent = this.text("success-title", "Price submitted");
        this.successMessage.textContent = this.text(
            "success-message",
            "Your proposal was submitted and will now be reviewed.",
        );
        this.back.textContent = this.text("back-label", "Back to offers");
        this.successLink.textContent = this.text("success-label", "Back to offers");
        const url = this.getAttribute("success-url")?.trim() || "";
        for (const link of [this.back, this.successLink]) {
            link.closest("mossa-button")?.toggleAttribute("hidden", !url);
            if (url) {
                link.setAttribute("href", url);
            } else {
                link.removeAttribute("href");
            }
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

    async request(path, init = {}) {
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
            throw new Error(body?.error || body?.message || this.text("error-message", "Something went wrong."));
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error(this.text("error-message", "Invalid response."));
        }
        return body;
    }

    async requestEndpoint(id, init = {}) {
        const path = endpointPaths[id];
        if (!path) {
            throw new Error(`Undeclared price endpoint: ${id}`);
        }
        return this.request(path, init);
    }

    async requestFunction(id, init = {}) {
        return this.requestEndpoint(id, init);
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
    get locale() {
        return this.getAttribute("locale") || "en-US";
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
    get sellerConsent() {
        return this.querySelector("[data-seller-consent]");
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
        return this.querySelector("[data-retry]");
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

function renderLinkedConsent(container, consentText, documentLabel, documentUrl) {
    const link = document.createElement("a");
    link.setAttribute("data-seller-terms-link", "");
    if (documentUrl) {
        link.href = documentUrl;
    }
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = documentLabel;
    const start = consentText.toLocaleLowerCase().indexOf(documentLabel.toLocaleLowerCase());
    container.replaceChildren();
    if (start < 0) {
        container.append(consentText, " ", link);
        return;
    }
    container.append(consentText.slice(0, start), link, consentText.slice(start + documentLabel.length));
}

function marketplaceTermsRequirement(value) {
    const version = textValue(value?.version);
    const hash = textValue(value?.hash).toLowerCase();
    if (!version || version.length > 200 || !/^[a-f0-9]{64}$/.test(hash)) {
        return null;
    }
    const published = publishedMarketplaceTermsRequirement(value);
    if (value?.mode === "published_page") {
        return published ? { version, hash, ...published } : null;
    }
    if (value?.mode !== "legacy") {
        return null;
    }
    return { version, hash };
}

function publishedMarketplaceTermsRequirement(value) {
    const pagePath = textValue(value?.page?.path);
    const label = textValue(value?.label);
    const consentText = textValue(value?.consentText);
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

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferPriceForm);
