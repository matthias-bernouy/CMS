import { Component } from "@bernouy/components/base";
import {
    clearResponsiveSourceImageElement,
    syncResponsiveSourceImageElement,
} from "@bernouy/cms-source-images/browser";
import { orderCopy, readOrderCopy } from "./copy";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type RecordValue = Record<string, any>;
type PaymentState =
    | "missing"
    | "created"
    | "requires_action"
    | "processing"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "manual_review"
    | "refunded"
    | "partially_refunded"
    | "disputed"
    | "unknown";

class PublicMessageError extends Error {}
class RemoteRequestError extends Error {}

export class OrderDetail extends Component {
    static observedAttributes = [
        ...Object.keys(orderCopy),
        "checkout-url",
        "delivery-estimate-label",
        "locale",
        "error-title",
        "error-message",
        "missing-order-message",
    ];

    private renderedOrder:
        | [RecordValue, RecordValue | null, RecordValue | null, RecordValue | null, RecordValue | null]
        | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.syncPresentation();
        this.load().catch((error) => this.fail(error));
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.syncPresentation();
        }
    }

    private syncPresentation(): void {
        this.set('[data-error] [slot="title"]', this.text("error-title", "Order not found"));
        for (const element of this.shadowRoot!.querySelectorAll<HTMLElement>("[data-order-copy]")) {
            element.textContent = this.copy(element.dataset.orderCopy!);
        }
        this.shadowRoot!.querySelector("mossa-skeleton[label]")!.setAttribute("label", this.copy("loading-label"));
        this.shadowRoot!.querySelector(".progress")!.setAttribute("aria-label", this.copy("progress-label"));
        if (this.renderedOrder) {
            this.render(...this.renderedOrder);
        }
    }

    private copy = (name: string, values: Record<string, string> = {}): string => readOrderCopy(this, name, values);

    private text(name: string, fallback: string): string {
        return this.getAttribute(name)?.trim() || fallback;
    }

    private async load(): Promise<void> {
        this.show("loading");
        if (!this.orderId) {
            throw new PublicMessageError(this.text("missing-order-message", "The order identifier is missing."));
        }
        const order = await this.request(`/.cms/sources/commerce/myOrder?id=${encodeURIComponent(this.orderId)}`);
        const [paymentResult, relay, offer] = await Promise.all([
            this.request(
                `/.cms/sources/system-functions/getPaymentForOrder?orderId=${encodeURIComponent(this.orderId)}`,
            ).catch(() => null),
            this.request(
                `/.cms/sources/system-functions/getRelayPointForOrder?orderId=${encodeURIComponent(this.orderId)}`,
            ).catch(() => null),
            this.loadOffer(order).catch(() => null),
        ]);
        const payment = paymentResult?.payment || null;
        const shipment = await this.loadShipment().catch(() => null);
        this.renderedOrder = [order, payment, relay, offer, shipment];
        this.render(...this.renderedOrder);
        this.show("content");
    }

    private async loadOffer(order: RecordValue): Promise<RecordValue | null> {
        const offerId = order.lines?.[0]?.offerId;
        return offerId ? this.request(`/.cms/sources/commerce/offer?id=${encodeURIComponent(offerId)}`) : null;
    }

    private async loadShipment(): Promise<RecordValue | null> {
        const result = await this.request(
            `/.cms/sources/system-functions/getShipmentForOrder?orderId=${encodeURIComponent(this.orderId)}`,
        ).catch(() => null);
        return Array.isArray(result?.shipments) ? result.shipments[0] : null;
    }

    private render(
        order: RecordValue,
        payment: RecordValue | null,
        relay: RecordValue | null,
        offer: RecordValue | null,
        shipment: RecordValue | null,
    ): void {
        const line = order.lines?.[0] || {};
        const paymentState = normalizedPaymentState(payment, order);
        const status = orderPresentation(order.status, paymentState, shipment?.status, this.copy);
        this.set(
            "[data-order-number]",
            order.orderNumber || this.copy("order-reference-label", { reference: String(order.publicId || order.id) }),
        );
        this.set("[data-order-date]", this.copy("order-date-label", { date: date(order.createdAt, this.locale) }));
        this.set("[data-order-status]", status.label);
        this.orderStatus.dataset.tone = status.tone;

        this.set("[data-line-title]", line.title || line.offerSnapshot?.title || this.copy("item-label"));
        const variant = variantLabel(line.variantSnapshot);
        this.set("[data-line-variant]", variant, !variant);
        const condition =
            String(line.offerSnapshot?.conditionLabel || "").trim() ||
            this.text(
                `condition-${String(line.offerSnapshot?.conditionCode || "").replaceAll("_", "-")}-label`,
                conditionLabel(line.offerSnapshot?.conditionCode),
            );
        this.set("[data-line-condition]", condition ? this.copy("condition-label", { condition }) : "", !condition);
        this.set(
            "[data-line-price]",
            price(Number(line.totalAmount ?? order.subtotalAmount), order.currency, this.locale),
        );

        const breakdown = financialBreakdown(order);
        this.set(
            "[data-subtotal]",
            priceOrPending(breakdown.subtotalAmount, breakdown.currency, this.locale, this.copy),
        );
        this.set(
            "[data-shipping]",
            amountOrPending(breakdown.shippingAmount, breakdown.currency, this.locale, this.copy),
        );
        this.set(
            "[data-protection]",
            amountOrPending(breakdown.buyerProtectionFeeAmount, breakdown.currency, this.locale, this.copy),
        );
        this.set(
            "[data-total]",
            amountOrPending(breakdown.buyerTotalAmount, breakdown.currency, this.locale, this.copy),
        );
        const paymentStatus = paymentPresentation(paymentState, this.copy);
        this.set("[data-payment-confirmation]", paymentStatus.label);
        this.paymentConfirmation.dataset.state = paymentStatus.tone;
        this.renderResumePayment(order, line, paymentState);

        this.renderRelay(relay, shipment);
        this.renderShipment(paymentState, shipment);

        const media = [...(Array.isArray(offer?.media) ? offer.media : [])].sort(
            (a, b) => Number(a.sortOrder) - Number(b.sortOrder),
        );
        const main = media.find((item) => item.isMain) || media[0];
        if (main?.media?.id) {
            bindPublicSourceImage(
                this.image,
                `/.cms/sources/commerce/publicOfferImage?id=${encodeURIComponent(main.media.id)}`,
                main.media.width,
                main.media.height,
            );
            this.image.alt = line.title || this.copy("item-heading");
            this.image.hidden = false;
        } else {
            clearPublicSourceImage(this.image);
            this.image.alt = "";
            this.image.hidden = true;
        }
    }

    private renderShipment(paymentState: PaymentState, shipment: RecordValue | null): void {
        const presentation = shipmentPresentation(paymentState, shipment?.status, this.copy);
        this.set("[data-delivery-title]", presentation.title);
        this.set("[data-delivery-description]", presentation.description);
        this.set(
            "[data-delivery-estimate]",
            shipment?.status === "delivered"
                ? this.copy("delivery-completed-label")
                : this.getAttribute("delivery-estimate-label")?.trim() ||
                      "Typical delivery time: 3 to 5 business days after shipment.",
        );
        this.renderProgress(presentation.stage, paymentState === "succeeded");

        const latestEvent = String(shipment?.latestEventLabel || "").trim();
        this.latestEvent.hidden = !latestEvent;
        if (latestEvent) {
            this.set("[data-latest-event-label]", latestEvent);
            const latestDate = dateTime(shipment?.latestEventAt, this.locale);
            this.set("[data-latest-event-date]", latestDate, !latestDate);
        }

        const trackingUrl = safeHttpUrl(shipment?.trackingUrl);
        this.trackingAction.hidden = !trackingUrl;
        if (trackingUrl) {
            this.trackingLink.setAttribute("href", trackingUrl);
        }
        const trackingNumber = String(shipment?.expeditionNumber || "").trim();
        this.trackingNumber.hidden = !trackingNumber;
        if (trackingNumber) {
            this.trackingNumber.textContent = this.copy("tracking-number-label", { number: trackingNumber });
        }
    }

    private renderResumePayment(order: RecordValue, line: RecordValue, paymentState: PaymentState): void {
        const orderId = positiveIdentifier(order.id);
        const offerId = positiveIdentifier(line.offerId);
        const checkoutUrl = this.getAttribute("checkout-url")?.trim() || "";
        const payable = isPayableOrder(order.status, paymentState) && Boolean(orderId && offerId && checkoutUrl);
        this.resumePaymentAction.hidden = !payable;
        if (!payable) {
            this.resumePayment.removeAttribute("href");
            return;
        }
        this.resumePayment.setAttribute("href", routeUrl(checkoutUrl, { offerId: offerId!, orderId: orderId! }));
    }

    private renderRelay(relay: RecordValue | null, shipment: RecordValue | null): void {
        this.set("[data-relay-name]", relay?.name || this.copy("relay-pending-label"));
        this.set("[data-relay-address]", relayAddress(relay, this.copy));
        const selectedLocation = String(relay?.relayLocation || relay?.location || "").trim();
        const shipmentLocation = String(shipment?.deliveryRelayLocation || "").trim();
        const shipmentConfirmed =
            Boolean(shipmentLocation) &&
            !["creating", "failed", "unknown", "cancelled"].includes(String(shipment?.status));
        let label = this.copy("relay-selected-label");
        let state = "neutral";
        if (selectedLocation && shipmentLocation && selectedLocation !== shipmentLocation) {
            label = this.copy("relay-mismatch-label");
            state = "danger";
        } else if (shipmentConfirmed && selectedLocation === shipmentLocation) {
            label = this.copy("relay-confirmed-label");
            state = "success";
        } else if (shipmentLocation) {
            label = this.copy("relay-confirmation-pending-label");
            state = "pending";
        }
        this.set("[data-relay-confirmation]", label);
        this.relayConfirmation.dataset.state = state;
    }

    private renderProgress(stage: number, confirmed: boolean): void {
        this.progressSteps.forEach((step, index) => {
            const state = !confirmed
                ? "upcoming"
                : index < stage
                  ? "complete"
                  : index === stage
                    ? "current"
                    : "upcoming";
            step.dataset.state = state;
        });
    }

    private set(selector: string, value: string, hidden = false): void {
        const element = this.shadowRoot!.querySelector<HTMLElement>(selector)!;
        element.textContent = value;
        element.hidden = hidden;
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
            throw new RemoteRequestError(responseMessage(body));
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error();
        }
        return body;
    }

    private fail(error: unknown): void {
        this.errorMessage.textContent = publicErrorMessage(
            error,
            this.text("error-message", "The order could not be loaded. Try again shortly."),
        );
        this.show("error");
    }

    private show(state: "loading" | "content" | "error"): void {
        this.loading.hidden = state !== "loading";
        this.content.hidden = state !== "content";
        this.error.hidden = state !== "error";
    }

    private get orderId(): string {
        return (
            new URL(this.ownerDocument.defaultView?.location.href || location.href).searchParams.get("orderId") || ""
        );
    }
    private get locale(): string {
        return this.getAttribute("locale")?.trim() || "en-US";
    }
    private get loading() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-loading]")!;
    }
    private get content() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-content]")!;
    }
    private get error() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-error]")!;
    }
    private get errorMessage() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-error-message]")!;
    }
    private get image() {
        return this.shadowRoot!.querySelector<HTMLImageElement>("[data-image]")!;
    }
    private get orderStatus() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-order-status]")!;
    }
    private get paymentConfirmation() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-payment-confirmation]")!;
    }
    private get resumePaymentAction() {
        return this.querySelector<HTMLElement>(':scope > [slot="resume-action"][data-resume-payment-action]')!;
    }
    private get resumePayment() {
        return this.querySelector<HTMLAnchorElement>(':scope > [slot="resume-action"] > a[data-resume-payment]')!;
    }
    private get progressSteps() {
        return [...this.shadowRoot!.querySelectorAll<HTMLElement>("[data-progress-step]")];
    }
    private get latestEvent() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-latest-event]")!;
    }
    private get trackingAction() {
        return this.querySelector<HTMLElement>(':scope > [slot="tracking-action"][data-tracking-action]')!;
    }
    private get trackingLink() {
        return this.querySelector<HTMLAnchorElement>(':scope > [slot="tracking-action"] > a[data-tracking-link]')!;
    }
    private get trackingNumber() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-tracking-number]")!;
    }
    private get relayConfirmation() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-relay-confirmation]")!;
    }
}

function bindPublicSourceImage(image: HTMLImageElement, url: string, width: unknown, height: unknown): void {
    const sourceWidth = positiveImageDimension(width);
    const sourceHeight = positiveImageDimension(height);
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

function positiveImageDimension(value: unknown): number | null {
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

function amountOrPending(
    amount: number | null,
    currency: unknown,
    locale: string,
    copy: (name: string) => string,
): string {
    return amount === null ? copy("amount-pending-label") : money(amount, currency, locale);
}
function priceOrPending(
    amount: number | null,
    currency: unknown,
    locale: string,
    copy: (name: string) => string,
): string {
    return amount === null ? copy("amount-pending-label") : price(amount, currency, locale);
}

function recordValue(value: unknown): RecordValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null;
}

function minorAmount(value: unknown): number | null {
    const amount =
        typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
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
function date(value: unknown, locale: string): string {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(parsed);
}
function dateTime(value: unknown, locale: string): string {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime())
        ? ""
        : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}
function normalizedPaymentState(payment: RecordValue | null, order: RecordValue): PaymentState {
    const settlement = String(payment?.settlementStatus ?? order.operation?.settlementStatus ?? "").toLowerCase();
    const dispute = String(payment?.disputeStatus ?? "").toLowerCase();
    const amountTotal = Number(payment?.amountTotal);
    const refundedAmount = Number(payment?.refundedAmount);
    if (
        settlement === "refunded" ||
        (Number.isSafeInteger(amountTotal) && amountTotal > 0 && refundedAmount >= amountTotal)
    ) {
        return "refunded";
    }
    if (Number.isSafeInteger(refundedAmount) && refundedAmount > 0) {
        return "partially_refunded";
    }
    if (payment?.manualReviewReason || settlement === "manual_review") {
        return "manual_review";
    }
    if (["open", "under_review", "lost"].includes(dispute)) {
        return "disputed";
    }

    const raw = String(payment?.paymentStatus ?? payment?.status ?? order.operation?.paymentStatus ?? "").toLowerCase();
    if (!raw) {
        return "missing";
    }
    if (raw === "paid") {
        return "succeeded";
    }
    if (raw === "canceled") {
        return "cancelled";
    }
    if (
        ["created", "requires_action", "processing", "succeeded", "failed", "cancelled", "manual_review"].includes(raw)
    ) {
        return raw as PaymentState;
    }
    return "unknown";
}

function paymentPresentation(state: PaymentState, copy: (name: string) => string): { label: string; tone: string } {
    return (
        {
            missing: { label: copy("state-payment-not-started"), tone: "pending" },
            created: { label: copy("state-payment-pending"), tone: "pending" },
            requires_action: { label: copy("state-payment-to-complete"), tone: "pending" },
            processing: { label: copy("state-payment-confirmation-in-progress"), tone: "pending" },
            succeeded: { label: copy("state-payment-confirmed"), tone: "success" },
            failed: { label: copy("state-payment-failed"), tone: "danger" },
            cancelled: { label: copy("state-payment-cancelled"), tone: "danger" },
            manual_review: { label: copy("state-payment-under-review"), tone: "neutral" },
            refunded: { label: copy("state-payment-refunded"), tone: "neutral" },
            partially_refunded: { label: copy("state-payment-partially-refunded"), tone: "neutral" },
            disputed: { label: copy("state-payment-disputed"), tone: "neutral" },
            unknown: { label: copy("state-payment-status-unavailable"), tone: "neutral" },
        } as Record<PaymentState, { label: string; tone: string }>
    )[state];
}

function isPayableOrder(order: unknown, payment: PaymentState): boolean {
    if (order === "awaiting_quote") {
        return payment === "missing";
    }
    return order === "awaiting_payment" && ["missing", "created", "requires_action"].includes(payment);
}

function orderPresentation(
    order: unknown,
    payment: PaymentState,
    shipment: unknown,
    copy: (name: string) => string,
): { label: string; tone: string } {
    if (order === "cancelled") {
        return { label: copy("state-cancelled"), tone: "danger" };
    }
    if (order === "cancellation_pending") {
        return { label: copy("state-cancellation-in-progress"), tone: "progress" };
    }
    if (order === "expired") {
        return { label: copy("state-expired"), tone: "neutral" };
    }
    if (order === "completed") {
        return { label: copy("state-completed"), tone: "success" };
    }
    if (order === "awaiting_quote") {
        return { label: copy("state-delivery-to-complete"), tone: "progress" };
    }
    if (order === "awaiting_payment") {
        if (payment === "processing") {
            return { label: copy("state-payment-in-progress"), tone: "progress" };
        }
        if (payment === "manual_review" || payment === "disputed") {
            return { label: copy("state-payment-under-review"), tone: "progress" };
        }
        if (payment === "failed") {
            return { label: copy("state-payment-failed"), tone: "danger" };
        }
        if (payment === "cancelled") {
            return { label: copy("state-payment-cancelled"), tone: "danger" };
        }
        if (["missing", "created", "requires_action"].includes(payment)) {
            return { label: copy("state-payment-pending"), tone: "progress" };
        }
        return { label: copy("state-status-unavailable"), tone: "neutral" };
    }
    if (order !== "active") {
        return { label: copy("state-status-unavailable"), tone: "neutral" };
    }
    if (shipment === "delivered") {
        return { label: copy("state-delivered"), tone: "success" };
    }
    if (shipment === "in_transit") {
        return { label: copy("state-in-delivery"), tone: "progress" };
    }
    if (shipment === "incident") {
        return { label: copy("state-delivery-incident"), tone: "danger" };
    }
    if (shipment === "failed") {
        return { label: copy("state-shipment-to-complete"), tone: "danger" };
    }
    if (shipment === "unknown") {
        return { label: copy("state-tracking-to-be-confirmed"), tone: "progress" };
    }
    return payment === "succeeded"
        ? { label: copy("state-order-confirmed"), tone: "success" }
        : payment === "unknown"
          ? { label: copy("state-status-unavailable"), tone: "neutral" }
          : { label: copy("state-order-under-review"), tone: "progress" };
}
function shipmentPresentation(
    payment: PaymentState,
    shipment: unknown,
    copy: (name: string) => string,
): { title: string; description: string; stage: number } {
    if (payment === "processing") {
        return {
            title: copy("state-payment-confirmation-in-progress"),
            description: copy("shipment-payment-pending-description"),
            stage: 0,
        };
    }
    if (payment === "manual_review" || payment === "disputed" || payment === "failed") {
        return {
            title: copy("state-payment-under-review"),
            description: copy("shipment-payment-review-description"),
            stage: 0,
        };
    }
    if (payment === "cancelled") {
        return {
            title: copy("state-payment-cancelled"),
            description: copy("shipment-payment-cancelled-description"),
            stage: 0,
        };
    }
    if (payment === "refunded" || payment === "partially_refunded") {
        return {
            title: copy("state-order-refunded"),
            description: copy("shipment-refunded-description"),
            stage: 0,
        };
    }
    if (payment === "unknown") {
        return {
            title: copy("shipment-unavailable-title"),
            description: copy("shipment-unavailable-description"),
            stage: 0,
        };
    }
    if (payment !== "succeeded") {
        return {
            title: copy("state-waiting-for-payment"),
            description: copy("shipment-payment-pending-description"),
            stage: 0,
        };
    }
    if (shipment === "delivered") {
        return {
            title: copy("state-parcel-delivered"),
            description: copy("shipment-delivered-description"),
            stage: 3,
        };
    }
    if (shipment === "in_transit") {
        return {
            title: copy("state-parcel-in-transit"),
            description: copy("shipment-in-transit-description"),
            stage: 2,
        };
    }
    if (shipment === "incident") {
        return {
            title: copy("state-delivery-incident-reported"),
            description: copy("shipment-incident-description"),
            stage: 2,
        };
    }
    if (shipment === "failed") {
        return {
            title: copy("state-shipment-to-complete"),
            description: copy("shipment-failed-description"),
            stage: 1,
        };
    }
    if (shipment === "unknown") {
        return {
            title: copy("state-shipment-status-to-be-confirmed"),
            description: copy("shipment-unknown-description"),
            stage: 1,
        };
    }
    if (shipment === "cancelled") {
        return {
            title: copy("state-shipment-cancelled"),
            description: copy("shipment-cancelled-description"),
            stage: 1,
        };
    }
    if (shipment === "created" || shipment === "label_ready" || shipment === "creating") {
        return {
            title: copy("state-shipment-being-prepared"),
            description: copy("shipment-created-description"),
            stage: 1,
        };
    }
    return {
        title: copy("state-order-being-prepared"),
        description: copy("shipment-preparing-description"),
        stage: 1,
    };
}
function positiveIdentifier(value: unknown): string | null {
    const identifier = String(value ?? "").trim();
    return /^\d+$/.test(identifier) && BigInt(identifier) > 0n ? identifier : null;
}
function relayAddress(relay: RecordValue | null, copy: (name: string) => string): string {
    if (!relay) {
        return copy("relay-address-unavailable-label");
    }
    return [relay.addressLine1, relay.addressLine2, [relay.postalCode, relay.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ");
}
function variantLabel(snapshot: RecordValue | null): string {
    const options = Array.isArray(snapshot?.options) ? snapshot!.options : [];
    if (options.length) {
        return options
            .map((item: RecordValue) => `${item.axisLabel || item.axisKey} : ${item.valueLabel || item.valueKey}`)
            .join(" · ");
    }
    return String(snapshot?.title || "");
}
function conditionLabel(value: unknown): string {
    const words = String(value || "")
        .trim()
        .replaceAll(/[_-]+/g, " ");
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}
function safeHttpUrl(value: unknown): string {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
        return "";
    }
}

function routeUrl(template: string, values: Record<string, string>): string {
    return Object.entries(values).reduce(
        (url, [name, value]) => url.replaceAll(`{${name}}`, encodeURIComponent(value)),
        template,
    );
}
function headers(value: HeadersInit | undefined): Record<string, string> {
    if (!value) {
        return {};
    }
    if (value instanceof Headers) {
        return Object.fromEntries(value.entries());
    }
    if (Array.isArray(value)) {
        return Object.fromEntries(value);
    }
    return value as Record<string, string>;
}

function publicErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof PublicMessageError) {
        return error.message;
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
