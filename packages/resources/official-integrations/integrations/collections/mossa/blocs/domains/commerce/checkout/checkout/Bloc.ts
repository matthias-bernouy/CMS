import { Component } from "@bernouy/components/base";
import {
    clearResponsiveSourceImageElement,
    syncResponsiveSourceImageElement,
} from "@bernouy/cms-source-images/browser";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import {
    checkoutReference,
    checkoutReturnPath,
    idempotencyStorageKey,
    protectedOrderPayload,
    type CheckoutReference,
} from "./checkout-contract";

type RecordValue = Record<string, any>;
type Step = "information" | "delivery" | "payment";
type MetadataControl = HTMLElement & { value: string | number | boolean };
type MetadataEntry = {
    control: MetadataControl;
    type: string;
    readValue?: () => string | number | boolean;
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
        "country-code",
        "delivery-label",
        "information-label",
        "login-url",
        "locale",
        "order-url",
        "payment-label",
        "title",
    ];
    private offer: RecordValue | null = null;
    private account: RecordValue | null = null;
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
                    ? "The accepted proposal to pay is missing."
                    : "The offer to purchase is missing.",
            );
        }
        try {
            this.account = await this.request("/.cms/sources/user-account/getAccount");
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
                ? this.request(
                      `/.cms/sources/commerce/getMyPriceAgreementCheckout?agreementId=${encodeURIComponent(reference.id)}`,
                  )
                : this.request(`/.cms/sources/commerce/offer?id=${encodeURIComponent(reference.id)}`),
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
        this.fillAccount(this.account, String(this.account.email || ""));
        if (this.priceAgreement) {
            this.renderPriceAgreement(this.priceAgreement);
        } else {
            this.renderOffer(this.offer!);
        }
        this.show("content");

        const orderId = reference.kind === "agreement" ? String(this.priceAgreement?.orderId || "") : this.orderId;
        if (orderId) {
            this.writeOrderId(orderId);
            this.order = await this.request(`/.cms/sources/commerce/myOrder?id=${encodeURIComponent(orderId)}`);
            this.renderOrder(this.order);
            const hasDeliveryQuote = hasLockedFinancialTerms(this.order);
            if (hasDeliveryQuote) {
                this.setStep("payment");
                this.configurePayment(this.order);
            } else {
                this.setStatus(this.deliveryStatus, "Select the pickup point again to resume this order.", false);
                this.setStep("delivery");
            }
        } else {
            if (reference.kind === "agreement" && this.priceAgreement?.status !== "active") {
                throw new PublicMessageError(priceAgreementUnavailableMessage(this.priceAgreement?.status));
            }
            this.setStep("information");
        }
    }

    private onSaveInformation = (): void => {
        this.saveInformation().catch((error) =>
            this.setStatus(
                this.informationStatus,
                publicErrorMessage(error, "Your information could not be saved. Try again shortly."),
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
            setValidationMessage(control);
        }
    };
    private onCreateOrder = (): void => {
        this.createOrder().catch((error) =>
            this.setStatus(
                this.deliveryStatus,
                publicErrorMessage(error, "The order could not be prepared. Try again shortly."),
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
            this.shippingElement.textContent = "To calculate";
        }
        this.protectionElement.textContent = "To calculate";
        this.totalElement.textContent = "To calculate";
    };
    private onPaymentSuccess = (): void => {
        void this.finalizePaidOrder();
    };
    private onPaymentProcessing = (): void => {
        this.setStatus(this.paymentStatus, "Payment is being processed. You can view your order.", false);
        this.goToOrder(900);
    };

    private async saveInformation(): Promise<void> {
        this.syncInformationValidation();
        this.syncMetadataValidation();
        const payload = this.accountPayload();
        const missing = [
            ["givenName", "first name"],
            ["surname", "last name"],
            ["phone", "phone"],
            ["addressLine1", "address"],
            ["postalCode", "postal code"],
            ["city", "city"],
        ]
            .filter(([key]) => !String(payload[key] || "").trim())
            .map(([, label]) => label);
        if (missing.length) {
            this.informationForm.reportValidity();
            throw new PublicMessageError(`Enter the following information: ${missing.join(", ")}.`);
        }
        if (!this.informationForm.reportValidity()) {
            throw new PublicMessageError("Check the information in the form.");
        }
        this.setButtonBusy(this.saveInformationButton, true);
        this.setStatus(this.informationStatus, "Saving…", false);
        try {
            this.account = await this.request("/.cms/sources/user-account/updateAccount", {
                method: "POST",
                body: JSON.stringify(payload),
            });
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
            throw new PublicMessageError("Choose a pickup point before continuing.");
        }
        this.setButtonBusy(this.createOrderButton, true);
        this.setStatus(this.deliveryStatus, "Creating the order and checking delivery…", false);
        try {
            const address = this.addressSnapshot();
            const idempotencyKey = this.idempotencyKey();
            if (!this.order) {
                this.order = await this.request("/.cms/sources/system-functions/createProtectedOrder", {
                    method: "POST",
                    body: JSON.stringify(
                        protectedOrderPayload(
                            this.checkoutReference,
                            this.offer.id,
                            idempotencyKey,
                            address,
                            this.orderMetadata(),
                        ),
                    ),
                });
                this.writeOrderId(String(this.order.id));
            }
            const result = await this.request("/.cms/sources/system-functions/setRelayPointForOrder", {
                method: "POST",
                body: JSON.stringify({
                    orderId: String(this.order.id),
                    relayLocation: this.relay.location,
                    country: this.relay.country || this.countryCode,
                    postalCode: this.relay.searchPostalCode || this.account.postalCode || this.relay.postalCode,
                    city: this.relay.searchCity || this.account.city || this.relay.city,
                }),
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
        this.setStatus(this.paymentStatus, "Payment confirmed. The seller can now prepare the shipment.", false);
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
        for (const input of this.informationForm.querySelectorAll<MetadataControl>(
            "mossa-input:not([data-metadata-lookup-input])",
        )) {
            const control = input.shadowRoot?.querySelector<HTMLInputElement>("input");
            if (!control) {
                continue;
            }
            setValidationMessage(control);
            input.value = input.value;
        }
    }

    private syncMetadataValidation(): void {
        for (const { control, readValue } of this.metadataControls.values()) {
            if (!readValue) {
                continue;
            }
            const input = control.shadowRoot?.querySelector<HTMLInputElement>("input");
            if (!input) {
                continue;
            }
            const hasUnselectedQuery = Boolean(String(control.value || "").trim()) && !readValue();
            input.setCustomValidity(
                (control.hasAttribute("required") && !readValue()) || hasUnselectedQuery
                    ? "Select an option from the list."
                    : "",
            );
            control.value = control.value;
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
        for (const [key, { control, type, readValue }] of this.metadataControls) {
            const raw = readValue ? readValue() : control.value;
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
            this.request("/.cms/sources/commerce/entityCustomFields?entityType=order"),
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
            const lookup = options.length && field.type !== "boolean" ? this.metadataLookup(field, options, key) : null;
            const control =
                lookup?.control ||
                (options.length || field.type === "boolean"
                    ? this.metadataSelect(field, options)
                    : this.metadataInput(field));
            control.setAttribute("name", `metadata.${key}`);
            this.metadataControls.set(key, {
                control,
                type: String(field.type || "string"),
                readValue: lookup?.readValue,
            });
            this.orderMetadataFields.append(lookup?.element || control);
        }
        this.orderMetadataFields.toggleAttribute("hidden", this.metadataControls.size === 0);
    }

    private metadataLookup(
        field: RecordValue,
        options: unknown[],
        key: string,
    ): { element: HTMLElement; control: MetadataControl; readValue: () => string } {
        const normalizedOptions = options
            .map((option) => {
                const record = recordValue(option);
                const value = String(record?.value ?? option ?? "");
                return { value, label: String(record?.label ?? value) };
            })
            .filter((option) => option.value && option.label);
        const wrapper = document.createElement("div");
        wrapper.className = "metadata-lookup";
        const input = document.createElement("mossa-input") as MetadataControl;
        input.setAttribute("data-metadata-lookup-input", "");
        input.setAttribute("type", "search");
        input.setAttribute("autocomplete", "off");
        input.setAttribute("label", String(field.label || field.id));
        input.setAttribute("placeholder", "Search options…");
        if (field.required === true) {
            input.setAttribute("required", "");
        }

        const results = document.createElement("div");
        results.className = "metadata-lookup-results";
        results.id = `metadata-${slugToken(key)}-results`;
        results.setAttribute("role", "listbox");
        results.setAttribute("aria-label", String(field.label || field.id));
        results.hidden = true;
        wrapper.append(input, results);

        const nativeInput = input.shadowRoot?.querySelector<HTMLInputElement>("input");
        nativeInput?.setAttribute("role", "combobox");
        nativeInput?.setAttribute("aria-autocomplete", "list");
        nativeInput?.setAttribute("aria-controls", results.id);
        nativeInput?.setAttribute("aria-expanded", "false");

        let selectedValue = "";
        let selectedLabel = "";
        let visibleOptions = normalizedOptions;
        let activeIndex = -1;

        const close = () => {
            results.hidden = true;
            activeIndex = -1;
            nativeInput?.setAttribute("aria-expanded", "false");
            nativeInput?.removeAttribute("aria-activedescendant");
        };
        const choose = (option: { value: string; label: string }) => {
            selectedValue = option.value;
            selectedLabel = option.label;
            input.value = option.label;
            nativeInput?.setCustomValidity("");
            input.value = input.value;
            close();
            input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        };
        const markActive = (index: number) => {
            const buttons = Array.from(results.querySelectorAll<HTMLButtonElement>('button[role="option"]'));
            if (!buttons.length) {
                return;
            }
            activeIndex = (index + buttons.length) % buttons.length;
            buttons.forEach((button, buttonIndex) =>
                button.setAttribute("aria-selected", String(buttonIndex === activeIndex)),
            );
            const active = buttons[activeIndex];
            nativeInput?.setAttribute("aria-activedescendant", active.id);
            active.scrollIntoView({ block: "nearest" });
        };
        const render = () => {
            const query = normalizeLookupText(String(input.value || ""));
            visibleOptions = normalizedOptions.filter((option) => normalizeLookupText(option.label).includes(query));
            activeIndex = -1;
            if (visibleOptions.length === 0) {
                const empty = document.createElement("p");
                empty.className = "metadata-lookup-empty";
                empty.textContent = "No option found.";
                results.replaceChildren(empty);
            } else {
                results.replaceChildren(
                    ...visibleOptions.map((option, index) => {
                        const button = document.createElement("button");
                        button.id = `${results.id}-${index}`;
                        button.type = "button";
                        button.setAttribute("role", "option");
                        button.setAttribute("aria-selected", "false");
                        button.textContent = option.label;
                        button.addEventListener("click", () => choose(option));
                        return button;
                    }),
                );
            }
            results.hidden = false;
            nativeInput?.setAttribute("aria-expanded", "true");
            nativeInput?.removeAttribute("aria-activedescendant");
        };
        const onInput = () => {
            if (String(input.value || "") !== selectedLabel) {
                selectedValue = "";
                selectedLabel = "";
            }
            nativeInput?.setCustomValidity("");
            input.value = input.value;
            render();
        };
        input.addEventListener("input", onInput);
        input.addEventListener("focus", render);
        input.addEventListener(
            "keydown",
            (event) => {
                if (!(event instanceof KeyboardEvent)) {
                    return;
                }
                if (event.key === "ArrowDown") {
                    event.preventDefault();
                    if (results.hidden) {
                        render();
                    }
                    markActive(activeIndex + 1);
                } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    if (results.hidden) {
                        render();
                    }
                    markActive(activeIndex - 1);
                } else if (event.key === "Enter" && !results.hidden && activeIndex >= 0) {
                    event.preventDefault();
                    choose(visibleOptions[activeIndex]);
                } else if (event.key === "Escape" && !results.hidden) {
                    event.preventDefault();
                    close();
                }
            },
            true,
        );
        wrapper.addEventListener("focusout", () =>
            window.setTimeout(() => {
                const active = this.detail.activeElement;
                if (active instanceof Node && wrapper.contains(active)) {
                    return;
                }
                const exact = normalizedOptions.find(
                    (option) => normalizeLookupText(option.label) === normalizeLookupText(String(input.value || "")),
                );
                if (!selectedValue && exact) {
                    choose(exact);
                } else {
                    close();
                }
            }),
        );

        return { element: wrapper, control: input, readValue: () => selectedValue };
    }

    private metadataSelect(field: RecordValue, options: unknown[]): MetadataControl {
        const select = document.createElement("mossa-select") as MetadataControl;
        select.setAttribute("label", String(field.label || field.id));
        select.setAttribute("placeholder", "Select an option");
        if (field.required === true) {
            select.setAttribute("required", "");
        }
        const empty = document.createElement("mossa-option");
        empty.setAttribute("value", "");
        empty.textContent = "No selection";
        const normalizedOptions =
            field.type === "boolean" && options.length === 0
                ? [
                      { value: "true", label: "Oui" },
                      { value: "false", label: "Non" },
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
        this.offerTitle.textContent = offer.title || offer.product?.title || "Offer";
        this.offerVariant.textContent = String(offer.variant?.title || "");
        this.offerVariant.hidden = !this.offerVariant.textContent;
        const amount = Number(offer.acceptedPriceAmount);
        this.subtotalElement.textContent = price(amount, offer.currency, this.locale);
        this.shippingElement.textContent = "To calculate";
        this.protectionElement.textContent = "To calculate";
        this.totalElement.textContent = "To calculate";
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
            this.offerImage.alt = offer.title || "Item";
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
        this.offerTitle.textContent = String(offer.title || "Offer");
        const sellerName = String(seller?.displayName || "").trim();
        const quantity = minorAmount(agreement.quantity) || 1;
        this.offerVariant.textContent = [
            quantity > 1 ? `Quantity : ${quantity}` : "",
            sellerName ? `Sold by ${sellerName}` : "",
        ]
            .filter(Boolean)
            .join(" · ");
        this.offerVariant.hidden = !this.offerVariant.textContent;
        this.subtotalElement.textContent = price(Number(agreement.subtotalAmount), agreement.currency, this.locale);
        this.shippingElement.textContent = "To calculate";
        this.protectionElement.textContent = "To calculate";
        this.totalElement.textContent = "To calculate";
        if (offer.mainImageMediaId) {
            bindPublicSourceImage(
                this.offerImage,
                `/.cms/sources/commerce/publicOfferImage?id=${encodeURIComponent(offer.mainImageMediaId)}`,
                offer.mainImageWidth ?? agreement.offerMainImageWidth,
                offer.mainImageHeight ?? agreement.offerMainImageHeight,
            );
            this.offerImage.alt = String(offer.title || "Item");
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
            throw new PublicMessageError(priceAgreementUnavailableMessage(status));
        }
        return agreement;
    }

    private renderOrder(order: RecordValue): void {
        const breakdown = financialBreakdown(order);
        this.subtotalElement.textContent =
            breakdown.subtotalAmount === null
                ? "To calculate"
                : price(breakdown.subtotalAmount, breakdown.currency, this.locale);
        this.shippingElement.textContent =
            breakdown.shippingAmount === null
                ? "To calculate"
                : money(breakdown.shippingAmount, breakdown.currency, this.locale);
        this.protectionElement.textContent =
            breakdown.buyerProtectionFeeAmount === null
                ? "To calculate"
                : money(breakdown.buyerProtectionFeeAmount, breakdown.currency, this.locale);
        this.totalElement.textContent =
            breakdown.buyerTotalAmount === null
                ? "To calculate"
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
            "The checkout flow could not be loaded. Try again shortly.",
        );
        this.show("error");
    }
    private async request(path: string, options: RequestInit = {}): Promise<RecordValue> {
        const response = await fetch(path, {
            credentials: "include",
            ...options,
            headers: {
                accept: "application/json",
                ...(options.body ? { "content-type": "application/json" } : {}),
                ...headers(options.headers),
            },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new RemoteRequestError(responseMessage(body), response.status);
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
        const url = new URL(location.href);
        const reference = this.checkoutReference;
        url.search = "";
        url.searchParams.set(reference.kind === "agreement" ? "agreementId" : "offerId", reference.id);
        url.searchParams.set("orderId", orderId);
        history.replaceState(history.state, "", `${url.pathname}${url.search}`);
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
    private text(name: string, fallback: string): string {
        return this.getAttribute(name)?.trim() || fallback;
    }
    private get checkoutReference(): CheckoutReference {
        return checkoutReference(new URL(location.href));
    }
    private get orderId(): string {
        return new URL(location.href).searchParams.get("orderId") || "";
    }
    private get detail() {
        return this.shadowRoot!;
    }
    private get locale(): string {
        return this.getAttribute("locale")?.trim() || "en-US";
    }
    private get countryCode(): string {
        return String(this.getAttribute("country-code") || this.account?.countryCode || "")
            .trim()
            .toUpperCase();
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
        return this.querySelector<HTMLAnchorElement>(':scope > [slot="login-action"] > a[data-login-link]')!;
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
        return this.querySelector<HTMLElement>(":scope > [data-checkout-payment]")!;
    }
    private get offerImage() {
        return this.detail.querySelector<HTMLImageElement>("[data-offer-image]")!;
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
        return this.querySelector<HTMLAnchorElement>(':scope > a[slot="order-navigation"][data-order-link]')!;
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

function normalizeLookupText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .trim();
}

function slugToken(value: string): string {
    return (
        normalizeLookupText(value)
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "field"
    );
}

function minorAmount(value: unknown): number | null {
    const amount =
        typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function setValidationMessage(input: HTMLInputElement): void {
    input.setCustomValidity("");
    const validity = input.validity;
    let message = "";
    if (validity.valueMissing) {
        message = "This field is required.";
    } else if (validity.typeMismatch && input.type === "email") {
        message = "Enter a valid email address.";
    } else if (validity.typeMismatch && input.type === "url") {
        message = "Enter a valid web address.";
    } else if (validity.tooShort) {
        message = `Enter at least ${input.minLength} characters.`;
    } else if (validity.tooLong) {
        message = `Enter at most ${input.maxLength} characters.`;
    } else if (validity.rangeUnderflow) {
        message = `Enter a value greater than or equal to ${input.min}.`;
    } else if (validity.rangeOverflow) {
        message = `Enter a value less than or equal to ${input.max}.`;
    } else if (validity.patternMismatch) {
        message = "Use the requested format.";
    } else if (validity.stepMismatch || validity.badInput) {
        message = "Enter a valid value.";
    } else if (!validity.valid) {
        message = "Check the entered value.";
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
function publicErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof PublicMessageError) {
        return error.message;
    }
    if (error instanceof RemoteRequestError && error.message === "SELLER_PROTECTED_PAYMENT_NOT_READY") {
        return "This offer is not currently available for purchase. The seller must complete payment activation.";
    }
    return fallback;
}
function responseMessage(body: unknown): string {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "";
    }
    const value = (body as RecordValue).error ?? (body as RecordValue).message;
    return typeof value === "string" ? value.trim() : "";
}
function headers(value: HeadersInit | undefined): Record<string, string> {
    return value ? Object.fromEntries(new Headers(value).entries()) : {};
}

function priceAgreementUnavailableMessage(status: unknown): string {
    if (status === "expired") {
        return "This accepted proposal expired and can no longer be paid.";
    }
    if (status === "canceled") {
        return "This accepted proposal was cancelled.";
    }
    if (status === "consumed") {
        return "This accepted proposal was already used for an order.";
    }
    return "This accepted proposal is no longer available for payment.";
}
