import { Component } from "@bernouy/components/base";
import { SourceFormError, sourceFormRequest } from "@bernouy/components/binding";
import {
    clearResponsiveSourceImageElement,
    syncResponsiveSourceImageElement,
} from "@bernouy/cms-source-images/browser";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import {
    checkoutReturnPath,
    idempotencyStorageKey,
    protectedOrderPayload,
    type CheckoutReference,
} from "./checkout-contract";

import { checkoutCopy, checkoutText, syncCheckoutCopy } from "./copy";

type RecordValue = Record<string, any>;
type Step = "information" | "delivery" | "payment";
type MetadataControl = HTMLElement & { value: string | number | boolean };
type MetadataEntry = {
    control: MetadataControl;
    type: string;
};

class PublicMessageError extends Error {}
class RemoteRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

export class CheckoutFlow extends Component {
    static observedAttributes = [
        ...checkoutCopy.map(([attribute]) => attribute),
        "country-code",
        "account-email",
        "login-title",
        "login-description",
        "error-title",
        "error-message",
        "missing-offer-message",
        "missing-agreement-message",
        "delivery-label",
        "information-label",
        "login-url",
        "order-url",
        "payment-label",
        "title",
    ];
    private offer: RecordValue | null = null;
    private account: RecordValue | null = null;
    private identity: RecordValue | null = null;
    private order: RecordValue | null = null;
    private relay: RecordValue | null = null;
    private priceAgreement: RecordValue | null = null;
    private metadataControls = new Map<string, MetadataEntry>();

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.saveInformationButton.addEventListener("click", this.onSaveInformation);
        this.backInformationButton.addEventListener("click", this.onBackInformation);
        this.createOrderButton.addEventListener("click", this.onCreateOrder);
        this.informationForm.addEventListener("input", this.onInformationInput, true);
        this.relayPicker.addEventListener("mossa-mondial-relay-picker:change", this.onRelayChange as EventListener);
        this.payment.addEventListener("mossa-commerce-stripe-payment:success", this.onPaymentSuccess as EventListener);
        this.payment.addEventListener(
            "mossa-commerce-stripe-payment:processing",
            this.onPaymentProcessing as EventListener,
        );
        this.syncPresentation();
        if (isFramed()) {
            this.show("content");
            this.setStep("information");
            return;
        }
        this.load().catch((error) => this.fail(error));
    }

    disconnectedCallback(): void {
        this.saveInformationButton.removeEventListener("click", this.onSaveInformation);
        this.backInformationButton.removeEventListener("click", this.onBackInformation);
        this.createOrderButton.removeEventListener("click", this.onCreateOrder);
        this.informationForm.removeEventListener("input", this.onInformationInput, true);
        this.relayPicker.removeEventListener("mossa-mondial-relay-picker:change", this.onRelayChange as EventListener);
        this.payment.removeEventListener(
            "mossa-commerce-stripe-payment:success",
            this.onPaymentSuccess as EventListener,
        );
        this.payment.removeEventListener(
            "mossa-commerce-stripe-payment:processing",
            this.onPaymentProcessing as EventListener,
        );
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.syncPresentation();
        }
    }

    private async load(): Promise<void> {
        this.show("loading");
        const reference = this.checkoutReference;
        if (!reference.id) {
            throw new PublicMessageError(
                reference.kind === "agreement"
                    ? this.text("missing-agreement-message", "The accepted proposal to pay is missing.")
                    : this.text("missing-offer-message", "The offer to purchase is missing."),
            );
        }
        try {
            [this.account, this.identity] = await Promise.all([
                this.requestSource("checkout-account"),
                this.requestSource("checkout-identity"),
            ]);
        } catch (error) {
            if (!(error instanceof RemoteRequestError) || (error.status !== 401 && error.status !== 403)) {
                throw error;
            }
            const loginUrl = this.getAttribute("login-url")?.trim() || "";
            this.loginLink.closest("mossa-button")?.toggleAttribute("hidden", !loginUrl);
            if (loginUrl) {
                this.loginLink.setAttribute(
                    "href",
                    loginUrl.replaceAll("{returnTo}", encodeURIComponent(location.pathname + location.search)),
                );
            } else {
                this.loginLink.removeAttribute("href");
            }
            this.show("login");
            return;
        }
        const [checkoutItem] = await Promise.all([
            reference.kind === "agreement"
                ? this.requestSource("checkout-agreement", { agreementId: reference.id })
                : this.requestSource("checkout-offer", { id: reference.id }),
            this.loadOrderMetadataFields(),
        ]);
        if (reference.kind === "agreement") {
            this.priceAgreement = this.validatePriceAgreement(checkoutItem, reference);
            this.offer = {
                ...recordValue(this.priceAgreement.offer),
                acceptedPriceAmount: this.priceAgreement.subtotalAmount,
                currency: this.priceAgreement.currency,
            };
        } else {
            this.offer = checkoutItem;
        }
        this.fillAccount(this.account, this.accountEmail);
        if (this.priceAgreement) {
            this.renderPriceAgreement(this.priceAgreement);
        } else {
            this.renderOffer(this.offer!);
        }
        this.show("content");

        const orderId = reference.kind === "agreement" ? String(this.priceAgreement?.orderId || "") : this.orderId;
        if (orderId) {
            this.writeOrderId(orderId);
            this.order = await this.requestSource("checkout-order", { id: orderId });
            this.renderOrder(this.order);
            const hasDeliveryQuote = hasLockedFinancialTerms(this.order);
            if (hasDeliveryQuote) {
                this.setStep("payment");
                this.configurePayment(this.order);
            } else {
                this.setStatus(this.deliveryStatus, this.copy("resume-delivery-message"), false);
                this.setStep("delivery");
            }
        } else {
            if (reference.kind === "agreement" && this.priceAgreement?.status !== "active") {
                throw new PublicMessageError(priceAgreementUnavailableMessage(this.priceAgreement?.status, this));
            }
            this.setStep("information");
        }
    }

    private onSaveInformation = (): void => {
        this.saveInformation().catch((error) =>
            this.setStatus(
                this.informationStatus,
                publicErrorMessage(error, this.copy("information-error-message"), this),
                true,
            ),
        );
    };
    private onBackInformation = (): void => {
        this.setStep("information");
    };
    private onInformationInput = (event: Event): void => {
        const control = event.composedPath().find((node) => node instanceof HTMLInputElement);
        if (control instanceof HTMLInputElement) {
            setValidationMessage(control, (key, parameters) => this.copy(key, parameters));
        }
    };
    private onCreateOrder = (): void => {
        this.createOrder().catch((error) =>
            this.setStatus(
                this.deliveryStatus,
                publicErrorMessage(error, this.copy("order-error-message"), this),
                true,
            ),
        );
    };
    private onRelayChange = (event: CustomEvent<RecordValue>): void => {
        this.relay = event.detail;
        this.createOrderButton.removeAttribute("disabled");
        this.setStatus(this.deliveryStatus, "", false);
        const shippingAmount = this.relay?.shippingAmount;
        if (Number.isSafeInteger(shippingAmount)) {
            const currency = this.relay?.currency || this.offer?.currency;
            this.shippingElement.textContent = money(shippingAmount, currency, this.locale);
        } else {
            this.shippingElement.textContent = this.copy("pending-amount-label");
        }
        this.protectionElement.textContent = this.copy("pending-amount-label");
        this.totalElement.textContent = this.copy("pending-amount-label");
    };
    private onPaymentSuccess = (): void => {
        void this.finalizePaidOrder();
    };
    private onPaymentProcessing = (): void => {
        this.setStatus(this.paymentStatus, this.copy("processing-message"), false);
        this.goToOrder(900);
    };

    private async saveInformation(): Promise<void> {
        this.syncInformationValidation();
        const payload = this.accountPayload();
        const missing = [
            ["givenName", this.copy("first-name-label")],
            ["surname", this.copy("last-name-label")],
            ["phone", this.copy("phone-label")],
            ["addressLine1", this.copy("address-label")],
            ["postalCode", this.copy("postal-code-label")],
            ["city", this.copy("city-label")],
        ]
            .filter(([key]) => !String(payload[key] || "").trim())
            .map(([, label]) => label);
        if (missing.length) {
            this.informationForm.reportValidity();
            throw new PublicMessageError(this.copy("missing-information-message", { fields: missing.join(", ") }));
        }
        if (!this.informationForm.reportValidity()) {
            throw new PublicMessageError(this.copy("invalid-information-message"));
        }
        this.setButtonBusy(this.saveInformationButton, true);
        this.setStatus(this.informationStatus, this.copy("saving-message"), false);
        try {
            this.account = await this.requestSource("checkout-account-update", payload);
            this.relayPicker.setAttribute("postal-code", payload.postalCode);
            this.relayPicker.setAttribute("city", payload.city);
            this.setStatus(this.informationStatus, "", false);
            this.setStep("delivery");
        } finally {
            this.setButtonBusy(this.saveInformationButton, false);
        }
    }

    private async createOrder(): Promise<void> {
        if (!this.relay || !this.account || !this.offer) {
            throw new PublicMessageError(this.copy("missing-relay-message"));
        }
        this.setButtonBusy(this.createOrderButton, true);
        this.setStatus(this.deliveryStatus, this.copy("creating-order-message"), false);
        try {
            const address = this.addressSnapshot();
            const idempotencyKey = this.idempotencyKey();
            if (!this.order) {
                this.order = await this.requestSource(
                    "checkout-order-create",
                    protectedOrderPayload(
                        this.checkoutReference,
                        this.offer.id,
                        idempotencyKey,
                        address,
                        this.orderMetadata(),
                    ),
                );
                this.writeOrderId(String(this.order.id));
            }
            const result = await this.requestSource("checkout-relay-save", {
                orderId: String(this.order.id),
                relayLocation: this.relay.location,
                country: this.relay.country || this.countryCode,
                postalCode: this.relay.searchPostalCode || this.account.postalCode || this.relay.postalCode,
                city: this.relay.searchCity || this.account.city || this.relay.city,
            });
            const financialTerms = recordValue(result.financialTerms);
            const lockedBreakdown = financialBreakdown({ ...this.order, financialTerms });
            if (
                !financialTerms ||
                lockedBreakdown.shippingAmount === null ||
                lockedBreakdown.buyerProtectionFeeAmount === null ||
                lockedBreakdown.buyerTotalAmount === null
            ) {
                throw new Error("Commerce returned incomplete financial terms.");
            }
            this.order = { ...this.order, financialTerms };
            this.renderOrder(this.order!);
            this.setStatus(this.deliveryStatus, "", false);
            this.setStep("payment");
            this.configurePayment(this.order!);
        } finally {
            this.setButtonBusy(this.createOrderButton, false);
        }
    }

    private async finalizePaidOrder(): Promise<void> {
        this.setStatus(this.paymentStatus, this.copy("paid-message"), false);
        this.goToOrder();
    }

    private configurePayment(order: RecordValue): void {
        const orderId = String(order.id);
        this.payment.setAttribute("order-id", orderId);
        this.payment.setAttribute(
            "return-url",
            `${location.origin}${checkoutReturnPath(this.checkoutReference, orderId, location.pathname)}`,
        );
    }

    private fillAccount(account: RecordValue, email: string): void {
        for (const name of ["givenName", "surname", "phone", "addressLine1", "addressLine2", "postalCode", "city"]) {
            this.input(name).value = String(account?.[name] || "");
        }
        this.input("email").value = email;
        const metadata = recordValue(account?.metadata) || {};
        for (const [key, { control }] of this.metadataControls) {
            const value = metadata[key];
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                control.value = value;
            }
        }
        this.relayPicker.setAttribute("postal-code", String(account?.postalCode || ""));
        this.relayPicker.setAttribute("city", String(account?.city || ""));
        if (this.countryCode) {
            this.relayPicker.setAttribute("country", this.countryCode);
        } else {
            this.relayPicker.removeAttribute("country");
        }
    }

    private accountPayload(): RecordValue {
        return {
            givenName: this.value("givenName"),
            surname: this.value("surname"),
            phone: this.value("phone"),
            addressLine1: this.value("addressLine1"),
            addressLine2: this.value("addressLine2"),
            postalCode: this.value("postalCode"),
            city: this.value("city"),
            countryCode: this.countryCode,
            locale: this.locale,
        };
    }

    private syncInformationValidation(): void {
        for (const input of this.informationForm.querySelectorAll<MetadataControl>("mossa-input")) {
            const control = input.shadowRoot?.querySelector<HTMLInputElement>("input");
            if (!control) {
                continue;
            }
            setValidationMessage(control, (key, parameters) => this.copy(key, parameters));
            input.value = input.value;
        }
    }

    private addressSnapshot(): RecordValue {
        return {
            ...this.accountPayload(),
            email: this.value("email"),
            recipient: `${this.value("givenName")} ${this.value("surname")}`.trim(),
        };
    }

    private orderMetadata(): RecordValue {
        const metadata: RecordValue = {};
        for (const [key, { control, type }] of this.metadataControls) {
            const raw = control.value;
            if (raw === "" || raw === null || raw === undefined) {
                continue;
            }
            if (type === "number") {
                const value = Number(raw);
                if (Number.isFinite(value)) {
                    metadata[key] = value;
                }
            } else if (type === "boolean") {
                metadata[key] = raw === true || raw === "true";
            } else {
                metadata[key] = String(raw);
            }
        }
        return metadata;
    }

    private async loadOrderMetadataFields(): Promise<void> {
        const [result] = await Promise.all([
            this.requestSource("checkout-order-fields", { entityType: "order" }),
            customElements.whenDefined("mossa-input"),
            customElements.whenDefined("mossa-select"),
            customElements.whenDefined("mossa-option"),
        ]);
        const fields = Array.isArray(result.fields)
            ? result.fields.filter((field) => field?.selfEditable === true)
            : [];
        this.metadataControls.clear();
        this.orderMetadataFields.replaceChildren();

        for (const field of fields) {
            const key = String(field?.id || "").trim();
            if (!key || field?.selfEditable !== true) {
                continue;
            }
            const options = Array.isArray(field.options) ? field.options : [];
            const control =
                options.length || field.type === "boolean"
                    ? this.metadataSelect(field, options, options.length > 0 && field.type !== "boolean")
                    : this.metadataInput(field);
            control.setAttribute("name", `metadata.${key}`);
            this.metadataControls.set(key, {
                control,
                type: String(field.type || "string"),
            });
            this.orderMetadataFields.append(control);
        }
        this.orderMetadataFields.toggleAttribute("hidden", this.metadataControls.size === 0);
    }

    private metadataSelect(field: RecordValue, options: unknown[], searchable = false): MetadataControl {
        const select = document.createElement("mossa-select") as MetadataControl;
        select.setAttribute("label", String(field.label || field.id));
        select.setAttribute(
            "placeholder",
            this.copy(searchable ? "search-options-placeholder" : "select-option-placeholder"),
        );
        if (searchable) {
            select.setAttribute("searchable", "");
            select.setAttribute("empty-label", this.copy("empty-options-message"));
        }
        if (field.required === true) {
            select.setAttribute("required", "");
        }
        const empty = document.createElement("mossa-option");
        empty.setAttribute("value", "");
        empty.textContent = this.copy("no-selection-label");
        const normalizedOptions =
            field.type === "boolean" && options.length === 0
                ? [
                      { value: "true", label: this.copy("yes-label") },
                      { value: "false", label: this.copy("no-label") },
                  ]
                : options;
        select.append(
            empty,
            ...normalizedOptions.map((option) => {
                const record = recordValue(option);
                const value = String(record?.value ?? option ?? "");
                const item = document.createElement("mossa-option");
                item.setAttribute("value", value);
                item.textContent = String(record?.label ?? value);
                return item;
            }),
        );
        return select;
    }

    private metadataInput(field: RecordValue): MetadataControl {
        const input = document.createElement("mossa-input") as MetadataControl;
        input.setAttribute("label", String(field.label || field.id));
        if (field.type === "number") {
            input.setAttribute("type", "number");
        }
        if (field.required === true) {
            input.setAttribute("required", "");
        }
        return input;
    }

    private renderOffer(offer: RecordValue): void {
        this.offerTitle.textContent = offer.title || offer.product?.title || this.copy("fallback-offer-label");
        this.offerVariant.textContent = String(offer.variant?.title || "");
        this.offerVariant.hidden = !this.offerVariant.textContent;
        const amount = Number(offer.acceptedPriceAmount);
        this.subtotalElement.textContent = price(amount, offer.currency, this.locale);
        this.shippingElement.textContent = this.copy("pending-amount-label");
        this.protectionElement.textContent = this.copy("pending-amount-label");
        this.totalElement.textContent = this.copy("pending-amount-label");
        const media = [...(Array.isArray(offer.media) ? offer.media : [])].sort(
            (a, b) => Number(a.sortOrder) - Number(b.sortOrder),
        );
        const main = media.find((item) => item.isMain) || media[0];
        if (main?.media?.id) {
            bindPublicSourceImage(
                this.offerImage,
                `/.cms/sources/commerce/publicOfferImage?id=${encodeURIComponent(main.media.id)}`,
                main.media.width,
                main.media.height,
            );
            this.offerImage.alt = offer.title || this.copy("fallback-item-label");
            this.offerImage.hidden = false;
        } else {
            clearPublicSourceImage(this.offerImage);
            this.offerImage.alt = "";
            this.offerImage.hidden = true;
        }
    }

    private renderPriceAgreement(agreement: RecordValue): void {
        const offer = recordValue(agreement.offer) || {};
        const seller = recordValue(agreement.seller);
        this.offerTitle.textContent = String(offer.title || this.copy("fallback-offer-label"));
        const sellerName = String(seller?.displayName || "").trim();
        const quantity = minorAmount(agreement.quantity) || 1;
        this.offerVariant.textContent = [
            quantity > 1 ? this.copy("quantity-label", { count: quantity }) : "",
            sellerName ? this.copy("seller-label", { seller: sellerName }) : "",
        ]
            .filter(Boolean)
            .join(" · ");
        this.offerVariant.hidden = !this.offerVariant.textContent;
        this.subtotalElement.textContent = price(Number(agreement.subtotalAmount), agreement.currency, this.locale);
        this.shippingElement.textContent = this.copy("pending-amount-label");
        this.protectionElement.textContent = this.copy("pending-amount-label");
        this.totalElement.textContent = this.copy("pending-amount-label");
        if (offer.mainImageMediaId) {
            bindPublicSourceImage(
                this.offerImage,
                `/.cms/sources/commerce/publicOfferImage?id=${encodeURIComponent(offer.mainImageMediaId)}`,
                offer.mainImageWidth ?? agreement.offerMainImageWidth,
                offer.mainImageHeight ?? agreement.offerMainImageHeight,
            );
            this.offerImage.alt = String(offer.title || this.copy("fallback-item-label"));
            this.offerImage.hidden = false;
        } else {
            clearPublicSourceImage(this.offerImage);
            this.offerImage.alt = "";
            this.offerImage.hidden = true;
        }
    }

    private validatePriceAgreement(agreement: RecordValue, reference: CheckoutReference): RecordValue {
        if (
            String(agreement.agreementId || "") !== reference.id ||
            !recordValue(agreement.offer) ||
            !Number.isSafeInteger(agreement.subtotalAmount) ||
            !String(agreement.currency || "").trim()
        ) {
            throw new Error("Commerce returned an invalid price agreement checkout context.");
        }
        const status = String(agreement.status || "");
        if (status === "consumed" && agreement.orderId) {
            return agreement;
        }
        if (status !== "active") {
            throw new PublicMessageError(priceAgreementUnavailableMessage(status, this));
        }
        return agreement;
    }

    private renderOrder(order: RecordValue): void {
        const breakdown = financialBreakdown(order);
        this.subtotalElement.textContent =
            breakdown.subtotalAmount === null
                ? this.copy("pending-amount-label")
                : price(breakdown.subtotalAmount, breakdown.currency, this.locale);
        this.shippingElement.textContent =
            breakdown.shippingAmount === null
                ? this.copy("pending-amount-label")
                : money(breakdown.shippingAmount, breakdown.currency, this.locale);
        this.protectionElement.textContent =
            breakdown.buyerProtectionFeeAmount === null
                ? this.copy("pending-amount-label")
                : money(breakdown.buyerProtectionFeeAmount, breakdown.currency, this.locale);
        this.totalElement.textContent =
            breakdown.buyerTotalAmount === null
                ? this.copy("pending-amount-label")
                : money(breakdown.buyerTotalAmount, breakdown.currency, this.locale);
    }

    private setStep(step: Step): void {
        this.detail
            .querySelectorAll<HTMLElement>("[data-panel]")
            .forEach((panel) => (panel.hidden = panel.dataset.panel !== step));
        const steps: Step[] = ["information", "delivery", "payment"];
        const current = steps.indexOf(step);
        this.steps.dataset.current = step;
        this.detail.querySelectorAll<HTMLElement>("[data-step]").forEach((item) => {
            const index = steps.indexOf(item.dataset.step as Step);
            item.toggleAttribute("data-active", index === current);
            item.toggleAttribute("data-complete", index < current);
        });
    }

    private syncPresentation(): void {
        syncCheckoutCopy(this);
        this.input("email").setAttribute("value", this.accountEmail);
        this.login.querySelector<HTMLElement>('[slot="title"]')!.textContent = this.text(
            "login-title",
            "Sign in to continue",
        );
        this.login.querySelector<HTMLElement>('[slot="description"]')!.textContent = this.text(
            "login-description",
            "An account is required to secure the order and track delivery.",
        );
        this.error.querySelector<HTMLElement>('[slot="title"]')!.textContent = this.text(
            "error-title",
            "Unable to continue",
        );
        this.titleElement.textContent = this.text("title", "Complete my order");
        this.informationLabel.textContent = this.text("information-label", "Information");
        this.deliveryLabel.textContent = this.text("delivery-label", "Delivery");
        this.paymentLabel.textContent = this.text("payment-label", "Payment");
    }

    private show(state: "loading" | "login" | "content" | "error"): void {
        this.loading.hidden = state !== "loading";
        this.login.hidden = state !== "login";
        this.content.hidden = state !== "content";
        this.error.hidden = state !== "error";
    }
    private fail(error: unknown): void {
        this.errorMessage.textContent = publicErrorMessage(
            error,
            this.text("error-message", "The checkout flow could not be loaded. Try again shortly."),
            this,
        );
        this.show("error");
    }
    private async requestSource(sourceId: string, values: RecordValue = {}): Promise<RecordValue> {
        let body: unknown;
        try {
            body = await sourceFormRequest(this, sourceId, values);
        } catch (error) {
            if (error instanceof SourceFormError) {
                throw new RemoteRequestError(error.message, error.status);
            }
            throw error;
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error();
        }
        return body;
    }
    private idempotencyKey(): string {
        const key = idempotencyStorageKey(this.checkoutReference);
        let value = sessionStorage.getItem(key);
        if (!value) {
            value = crypto.randomUUID();
            sessionStorage.setItem(key, value);
        }
        return value;
    }
    private writeOrderId(orderId: string): void {
        const control = this.querySelector<HTMLInputElement>('[cms-param-sync="orderId"]');
        if (control && control.value !== orderId) {
            control.value = orderId;
            control.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }
    private goToOrder(delay = 0): void {
        const link = this.orderLink;
        const orderUrl = this.getAttribute("order-url")?.trim() || "";
        const orderId = String(this.order?.id || this.orderId);
        if (!orderUrl || !orderId) {
            this.dispatchEvent(
                new CustomEvent("mossa-checkout:complete", {
                    bubbles: true,
                    composed: true,
                    detail: { orderId },
                }),
            );
            return;
        }
        link.href = orderUrl.replaceAll("{orderId}", encodeURIComponent(orderId));
        window.setTimeout(() => link.click(), delay);
    }
    private setButtonBusy(button: HTMLButtonElement, busy: boolean): void {
        button.disabled = busy;
        button.toggleAttribute("aria-busy", busy);
    }
    private setStatus(element: HTMLElement, message: string, error: boolean): void {
        element.textContent = message;
        element.toggleAttribute("data-error", error);
    }
    private input(name: string): HTMLInputElement {
        return this.detail.querySelector(`[name="${name}"]`)! as HTMLInputElement;
    }
    private value(name: string): string {
        return String(this.input(name).value || "").trim();
    }
    private copy(name: string, parameters: Record<string, unknown> = {}): string {
        return checkoutText(this, name, parameters);
    }
    private text(name: string, fallback: string): string {
        return this.getAttribute(name)?.trim() || fallback;
    }
    private get checkoutReference(): CheckoutReference {
        const agreementId = this.paramValue("agreementId");
        return agreementId ? { kind: "agreement", id: agreementId } : { kind: "offer", id: this.paramValue("offerId") };
    }
    private get orderId(): string {
        return this.paramValue("orderId");
    }
    private paramValue(name: string): string {
        return this.querySelector<HTMLInputElement>(`[cms-param-sync="${name}"]`)?.value?.trim() || "";
    }
    private get detail() {
        return this.shadowRoot!;
    }
    private get locale(): string {
        return this.ownerDocument.documentElement.lang || this.ownerDocument.defaultView?.navigator.language || "en-US";
    }
    private get countryCode(): string {
        return String(this.getAttribute("country-code") || this.account?.countryCode || "")
            .trim()
            .toUpperCase();
    }
    private get accountEmail(): string {
        const subject = recordValue(this.identity?.subject);
        return String(subject?.email || this.account?.email || this.getAttribute("account-email") || "");
    }
    private get loading() {
        return this.detail.querySelector<HTMLElement>("[data-loading]")!;
    }
    private get login() {
        return this.detail.querySelector<HTMLElement>("[data-login]")!;
    }
    private get content() {
        return this.detail.querySelector<HTMLElement>("[data-content]")!;
    }
    private get error() {
        return this.detail.querySelector<HTMLElement>("[data-error]")!;
    }
    private get errorMessage() {
        return this.detail.querySelector<HTMLElement>("[data-error-message]")!;
    }
    private get loginLink() {
        return this.querySelector<HTMLAnchorElement>(':scope > [slot="login-action"] > a')!;
    }
    private get titleElement() {
        return this.detail.querySelector<HTMLElement>("[data-title]")!;
    }
    private get informationLabel() {
        return this.detail.querySelector<HTMLElement>("[data-information-label]")!;
    }
    private get deliveryLabel() {
        return this.detail.querySelector<HTMLElement>("[data-delivery-label]")!;
    }
    private get paymentLabel() {
        return this.detail.querySelector<HTMLElement>("[data-payment-label]")!;
    }
    private get saveInformationButton() {
        return this.detail.querySelector<HTMLButtonElement>("[data-save-information] > button")!;
    }
    private get backInformationButton() {
        return this.detail.querySelector<HTMLButtonElement>("[data-back-information] > button")!;
    }
    private get createOrderButton() {
        return this.detail.querySelector<HTMLButtonElement>("[data-create-order] > button")!;
    }
    private get informationStatus() {
        return this.detail.querySelector<HTMLElement>("[data-information-status]")!;
    }
    private get informationForm() {
        return this.detail.querySelector<HTMLFormElement>("[data-information-form]")!;
    }
    private get orderMetadataFields() {
        return this.detail.querySelector<HTMLElement>("[data-order-metadata-fields]")!;
    }
    private get deliveryStatus() {
        return this.detail.querySelector<HTMLElement>("[data-delivery-status]")!;
    }
    private get paymentStatus() {
        return this.detail.querySelector<HTMLElement>("[data-payment-status]")!;
    }
    private get steps() {
        return this.detail.querySelector<HTMLElement>(".steps")!;
    }
    private get relayPicker() {
        return this.detail.querySelector<HTMLElement>("[data-relay-picker]")!;
    }
    private get payment() {
        return this.querySelector<HTMLElement>(':scope > [slot="checkout-payment"]')!;
    }
    private get offerImage() {
        return this.detail.querySelector<HTMLImageElement>(".offer-image")!;
    }
    private get offerTitle() {
        return this.detail.querySelector<HTMLElement>("[data-offer-title]")!;
    }
    private get offerVariant() {
        return this.detail.querySelector<HTMLElement>("[data-offer-variant]")!;
    }
    private get subtotalElement() {
        return this.detail.querySelector<HTMLElement>("[data-subtotal]")!;
    }
    private get shippingElement() {
        return this.detail.querySelector<HTMLElement>("[data-shipping]")!;
    }
    private get protectionElement() {
        return this.detail.querySelector<HTMLElement>("[data-protection]")!;
    }
    private get totalElement() {
        return this.detail.querySelector<HTMLElement>("[data-total]")!;
    }
    private get orderLink() {
        return this.querySelector<HTMLAnchorElement>(':scope > a[slot="order-navigation"]')!;
    }
}

function bindPublicSourceImage(image: HTMLImageElement, url: string, width: unknown, height: unknown): void {
    const sourceWidth = positiveInteger(width);
    const sourceHeight = positiveInteger(height);
    image.setAttribute("data-source-image-access", "public");
    if (sourceWidth !== null && sourceHeight !== null) {
        image.setAttribute("data-source-width", String(sourceWidth));
        image.setAttribute("data-source-height", String(sourceHeight));
    } else {
        image.removeAttribute("data-source-width");
        image.removeAttribute("data-source-height");
    }
    image.setAttribute("data-cms-src", url);
    syncResponsiveSourceImageElement(image);
}

function clearPublicSourceImage(image: HTMLImageElement): void {
    clearResponsiveSourceImageElement(image);
    image.removeAttribute("data-cms-src");
    image.removeAttribute("data-source-width");
    image.removeAttribute("data-source-height");
    image.removeAttribute("data-source-image-access");
}

function positiveInteger(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

type FinancialBreakdown = {
    subtotalAmount: number | null;
    shippingAmount: number | null;
    buyerProtectionFeeAmount: number | null;
    buyerTotalAmount: number | null;
    currency: unknown;
};

function financialBreakdown(order: RecordValue): FinancialBreakdown {
    const terms = recordValue(order.financialTerms);
    const termsSubtotal = minorAmount(terms?.merchandiseSubtotalAmount);
    const shippingAmount = minorAmount(terms?.shippingAmount);
    const buyerTotalAmount = minorAmount(terms?.buyerTotalAmount);
    const explicitProtectionAmount = minorAmount(terms?.buyerProtectionFeeAmount);
    const derivedProtectionAmount =
        termsSubtotal !== null &&
        shippingAmount !== null &&
        buyerTotalAmount !== null &&
        buyerTotalAmount >= termsSubtotal + shippingAmount
            ? buyerTotalAmount - termsSubtotal - shippingAmount
            : null;
    return {
        subtotalAmount: termsSubtotal ?? minorAmount(order.subtotalAmount),
        shippingAmount,
        buyerProtectionFeeAmount: explicitProtectionAmount ?? derivedProtectionAmount,
        buyerTotalAmount,
        currency: terms?.currency || order.currency,
    };
}

function hasLockedFinancialTerms(order: RecordValue): boolean {
    const terms = recordValue(order.financialTerms);
    return Boolean(
        terms?.deliveryQuoteId || terms?.financialTermsHash || minorAmount(terms?.buyerTotalAmount) !== null,
    );
}

function recordValue(value: unknown): RecordValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null;
}

function minorAmount(value: unknown): number | null {
    const amount =
        typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function setValidationMessage(
    input: HTMLInputElement,
    copy: (key: string, parameters?: Record<string, unknown>) => string,
): void {
    input.setCustomValidity("");
    const validity = input.validity;
    let message = "";
    if (validity.valueMissing) {
        message = copy("required-message");
    } else if (validity.typeMismatch && input.type === "email") {
        message = copy("invalid-email-message");
    } else if (validity.typeMismatch && input.type === "url") {
        message = copy("invalid-url-message");
    } else if (validity.tooShort) {
        message = copy("too-short-message", { minimum: input.minLength });
    } else if (validity.tooLong) {
        message = copy("too-long-message", { maximum: input.maxLength });
    } else if (validity.rangeUnderflow) {
        message = copy("minimum-value-message", { minimum: input.min });
    } else if (validity.rangeOverflow) {
        message = copy("maximum-value-message", { maximum: input.max });
    } else if (validity.patternMismatch) {
        message = copy("invalid-format-message");
    } else if (validity.stepMismatch || validity.badInput) {
        message = copy("invalid-value-message");
    } else if (!validity.valid) {
        message = copy("check-value-message");
    }
    input.setCustomValidity(message);
}

function money(amount: number, currency: unknown, locale: string): string {
    if (!Number.isSafeInteger(amount)) {
        return "—";
    }
    try {
        const currencyCode = String(currency || "USD").toUpperCase();
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: currencyCode,
        }).format(amount / 100);
    } catch {
        return `${(amount / 100).toFixed(2)} ${String(currency || "USD").toUpperCase()}`;
    }
}
function price(amount: number, currency: unknown, locale: string): string {
    if (!Number.isSafeInteger(amount)) {
        return "—";
    }
    const rounded = Math.round(amount / 100);
    try {
        const currencyCode = String(currency || "USD").toUpperCase();
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: currencyCode,
            maximumFractionDigits: 0,
        }).format(rounded);
    } catch {
        return `${rounded} ${String(currency || "USD").toUpperCase()}`;
    }
}
function publicErrorMessage(error: unknown, fallback: string, host: HTMLElement): string {
    if (error instanceof PublicMessageError) {
        return error.message;
    }
    if (error instanceof RemoteRequestError && error.message === "SELLER_PROTECTED_PAYMENT_NOT_READY") {
        return checkoutText(host, "seller-not-ready-message");
    }
    return fallback;
}
function priceAgreementUnavailableMessage(status: unknown, host: HTMLElement): string {
    if (status === "expired") {
        return checkoutText(host, "agreement-expired-message");
    }
    if (status === "canceled") {
        return checkoutText(host, "agreement-canceled-message");
    }
    if (status === "consumed") {
        return checkoutText(host, "agreement-consumed-message");
    }
    return checkoutText(host, "agreement-unavailable-message");
}

function isFramed(): boolean {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}
