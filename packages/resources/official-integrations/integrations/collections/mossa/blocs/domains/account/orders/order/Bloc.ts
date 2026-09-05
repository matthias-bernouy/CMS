import { Component } from "@bernouy/components/base";
import {
    clearResponsiveSourceImageElement,
    syncResponsiveSourceImageElement,
} from "@bernouy/cms-source-images/browser";
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
    static observedAttributes = ["checkout-url", "delivery-estimate-label", "locale"];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.load().catch((error) => this.fail(error));
    }

    private async load(): Promise<void> {
        this.show("loading");
        if (!this.orderId) {
            throw new PublicMessageError("The order identifier is missing.");
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
        this.render(order, payment, relay, offer, shipment);
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
        const status = orderPresentation(order.status, paymentState, shipment?.status);
        this.set("[data-order-number]", order.orderNumber || `Order ${order.publicId || order.id}`);
        this.set("[data-order-date]", `Placed on ${date(order.createdAt, this.locale)}`);
        this.set("[data-order-status]", status.label);
        this.orderStatus.dataset.tone = status.tone;

        this.set("[data-line-title]", line.title || line.offerSnapshot?.title || "Item");
        const variant = variantLabel(line.variantSnapshot);
        this.set("[data-line-variant]", variant, !variant);
        const condition =
            String(line.offerSnapshot?.conditionLabel || "").trim() ||
            conditionLabel(line.offerSnapshot?.conditionCode);
        this.set("[data-line-condition]", condition ? `Condition: ${condition}` : "", !condition);
        this.set(
            "[data-line-price]",
            price(Number(line.totalAmount ?? order.subtotalAmount), order.currency, this.locale),
        );

        const breakdown = financialBreakdown(order);
        this.set("[data-subtotal]", priceOrPending(breakdown.subtotalAmount, breakdown.currency, this.locale));
        this.set("[data-shipping]", amountOrPending(breakdown.shippingAmount, breakdown.currency, this.locale));
        this.set(
            "[data-protection]",
            amountOrPending(breakdown.buyerProtectionFeeAmount, breakdown.currency, this.locale),
        );
        this.set("[data-total]", amountOrPending(breakdown.buyerTotalAmount, breakdown.currency, this.locale));
        const paymentStatus = paymentPresentation(paymentState);
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
            this.image.alt = line.title || "Ordered item";
            this.image.hidden = false;
        } else {
            clearPublicSourceImage(this.image);
            this.image.alt = "";
            this.image.hidden = true;
        }
    }

    private renderShipment(paymentState: PaymentState, shipment: RecordValue | null): void {
        const presentation = shipmentPresentation(paymentState, shipment?.status);
        this.set("[data-delivery-title]", presentation.title);
        this.set("[data-delivery-description]", presentation.description);
        this.set(
            "[data-delivery-estimate]",
            shipment?.status === "delivered"
                ? "Delivery completed"
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
            this.trackingNumber.textContent = `Parcel number ${trackingNumber}`;
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
        this.set("[data-relay-name]", relay?.name || "Pickup point to be confirmed");
        this.set("[data-relay-address]", relayAddress(relay));
        const selectedLocation = String(relay?.relayLocation || relay?.location || "").trim();
        const shipmentLocation = String(shipment?.deliveryRelayLocation || "").trim();
        const shipmentConfirmed =
            Boolean(shipmentLocation) &&
            !["creating", "failed", "unknown", "cancelled"].includes(String(shipment?.status));
        let label = "Pickup point selected for the order";
        let state = "neutral";
        if (selectedLocation && shipmentLocation && selectedLocation !== shipmentLocation) {
            label = "The parcel destination does not match the selected pickup point";
            state = "danger";
        } else if (shipmentConfirmed && selectedLocation === shipmentLocation) {
            label = "Destination recorded for the shipment";
            state = "success";
        } else if (shipmentLocation) {
            label = "Pickup-point confirmation pending";
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
        this.errorMessage.textContent = publicErrorMessage(error, "The order could not be loaded. Try again shortly.");
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

function amountOrPending(amount: number | null, currency: unknown, locale: string): string {
    return amount === null ? "To calculate" : money(amount, currency, locale);
}
function priceOrPending(amount: number | null, currency: unknown, locale: string): string {
    return amount === null ? "To calculate" : price(amount, currency, locale);
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

function paymentPresentation(state: PaymentState): { label: string; tone: string } {
    return (
        {
            missing: { label: "Payment not started", tone: "pending" },
            created: { label: "Payment pending", tone: "pending" },
            requires_action: { label: "Payment to complete", tone: "pending" },
            processing: { label: "Payment confirmation in progress", tone: "pending" },
            succeeded: { label: "Payment confirmed", tone: "success" },
            failed: { label: "Payment failed", tone: "danger" },
            cancelled: { label: "Payment cancelled", tone: "danger" },
            manual_review: { label: "Payment under review", tone: "neutral" },
            refunded: { label: "Payment refunded", tone: "neutral" },
            partially_refunded: { label: "Payment partially refunded", tone: "neutral" },
            disputed: { label: "Payment disputed", tone: "neutral" },
            unknown: { label: "Payment status unavailable", tone: "neutral" },
        } as Record<PaymentState, { label: string; tone: string }>
    )[state];
}

function isPayableOrder(order: unknown, payment: PaymentState): boolean {
    if (order === "awaiting_quote") {
        return payment === "missing";
    }
    return order === "awaiting_payment" && ["missing", "created", "requires_action"].includes(payment);
}

function orderPresentation(order: unknown, payment: PaymentState, shipment: unknown): { label: string; tone: string } {
    if (order === "cancelled") {
        return { label: "Cancelled", tone: "danger" };
    }
    if (order === "cancellation_pending") {
        return { label: "Cancellation in progress", tone: "progress" };
    }
    if (order === "expired") {
        return { label: "Expired", tone: "neutral" };
    }
    if (order === "completed") {
        return { label: "Completed", tone: "success" };
    }
    if (order === "awaiting_quote") {
        return { label: "Delivery to complete", tone: "progress" };
    }
    if (order === "awaiting_payment") {
        if (payment === "processing") {
            return { label: "Payment in progress", tone: "progress" };
        }
        if (payment === "manual_review" || payment === "disputed") {
            return { label: "Payment under review", tone: "progress" };
        }
        if (payment === "failed") {
            return { label: "Payment failed", tone: "danger" };
        }
        if (payment === "cancelled") {
            return { label: "Payment cancelled", tone: "danger" };
        }
        if (["missing", "created", "requires_action"].includes(payment)) {
            return { label: "Payment pending", tone: "progress" };
        }
        return { label: "Status unavailable", tone: "neutral" };
    }
    if (order !== "active") {
        return { label: "Status unavailable", tone: "neutral" };
    }
    if (shipment === "delivered") {
        return { label: "Delivered", tone: "success" };
    }
    if (shipment === "in_transit") {
        return { label: "In delivery", tone: "progress" };
    }
    if (shipment === "incident") {
        return { label: "Delivery incident", tone: "danger" };
    }
    if (shipment === "failed") {
        return { label: "Shipment to complete", tone: "danger" };
    }
    if (shipment === "unknown") {
        return { label: "Tracking to be confirmed", tone: "progress" };
    }
    return payment === "succeeded"
        ? { label: "Order confirmed", tone: "success" }
        : payment === "unknown"
          ? { label: "Status unavailable", tone: "neutral" }
          : { label: "Order under review", tone: "progress" };
}
function shipmentPresentation(
    payment: PaymentState,
    shipment: unknown,
): { title: string; description: string; stage: number } {
    if (payment === "processing") {
        return {
            title: "Payment confirmation in progress",
            description: "Preparation will begin once payment is confirmed.",
            stage: 0,
        };
    }
    if (payment === "manual_review" || payment === "disputed" || payment === "failed") {
        return {
            title: "Payment under review",
            description: "Preparation is paused while payment is reviewed.",
            stage: 0,
        };
    }
    if (payment === "cancelled") {
        return { title: "Payment cancelled", description: "This order cannot be prepared.", stage: 0 };
    }
    if (payment === "refunded" || payment === "partially_refunded") {
        return {
            title: "Order refunded",
            description: "No new shipment will be prepared for this order.",
            stage: 0,
        };
    }
    if (payment === "unknown") {
        return {
            title: "Suivi unavailable",
            description: "Payment status does not yet allow delivery details to be shown.",
            stage: 0,
        };
    }
    if (payment !== "succeeded") {
        return {
            title: "Waiting for payment",
            description: "Preparation will begin once payment is confirmed.",
            stage: 0,
        };
    }
    if (shipment === "delivered") {
        return {
            title: "Parcel delivered",
            description: "Your parcel was delivered to the selected pickup point.",
            stage: 3,
        };
    }
    if (shipment === "in_transit") {
        return {
            title: "Parcel in transit",
            description: "Your parcel is being handled by the carrier.",
            stage: 2,
        };
    }
    if (shipment === "incident") {
        return {
            title: "Delivery incident reported",
            description: "The latest known event is shown below.",
            stage: 2,
        };
    }
    if (shipment === "failed") {
        return {
            title: "Shipment to complete",
            description: "The parcel is not yet confirmed as shipped.",
            stage: 1,
        };
    }
    if (shipment === "unknown") {
        return {
            title: "Shipment status to be confirmed",
            description: "Waiting for carrier confirmation.",
            stage: 1,
        };
    }
    if (shipment === "cancelled") {
        return { title: "Shipment cancelled", description: "The parcel is not in transit.", stage: 1 };
    }
    if (shipment === "created" || shipment === "label_ready" || shipment === "creating") {
        return { title: "Shipment being prepared", description: "The parcel will be handed to the carrier.", stage: 1 };
    }
    return {
        title: "Order being prepared",
        description: "Tracking will appear here once the shipment is created.",
        stage: 1,
    };
}
function positiveIdentifier(value: unknown): string | null {
    const identifier = String(value ?? "").trim();
    return /^\d+$/.test(identifier) && BigInt(identifier) > 0n ? identifier : null;
}
function relayAddress(relay: RecordValue | null): string {
    if (!relay) {
        return "Pickup-point address unavailable";
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
