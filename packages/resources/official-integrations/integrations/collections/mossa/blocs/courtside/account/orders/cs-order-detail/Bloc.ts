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
    static observedAttributes = [
        "accent-color",
        "background-color",
        "border-color",
        "delivery-estimate-label",
        "text-color",
    ];

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

    private async load(): Promise<void> {
        this.show("loading");
        if (!this.orderId) {
            throw new PublicMessageError("L’identifiant de commande est manquant.");
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
        this.set("[data-order-number]", order.orderNumber || `Commande ${order.publicId || order.id}`);
        this.set("[data-order-date]", `Passée le ${date(order.createdAt)}`);
        this.set("[data-order-status]", status.label);
        this.orderStatus.dataset.tone = status.tone;

        this.set("[data-line-title]", line.title || line.offerSnapshot?.title || "Article");
        const variant = variantLabel(line.variantSnapshot);
        this.set("[data-line-variant]", variant, !variant);
        const condition = conditionLabel(line.offerSnapshot?.conditionCode);
        this.set("[data-line-condition]", condition ? `État : ${condition}` : "", !condition);
        this.set("[data-line-price]", price(Number(line.totalAmount ?? order.subtotalAmount), order.currency));

        const breakdown = financialBreakdown(order);
        this.set("[data-subtotal]", priceOrPending(breakdown.subtotalAmount, breakdown.currency));
        this.set("[data-shipping]", amountOrPending(breakdown.shippingAmount, breakdown.currency));
        this.set("[data-protection]", amountOrPending(breakdown.buyerProtectionFeeAmount, breakdown.currency));
        this.set("[data-total]", amountOrPending(breakdown.buyerTotalAmount, breakdown.currency));
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
            this.image.alt = line.title || "Article commandé";
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
                ? "Livraison terminée"
                : this.getAttribute("delivery-estimate-label")?.trim() ||
                      "Délai habituel : 3 à 5 jours ouvrés après l’expédition.",
        );
        this.renderProgress(presentation.stage, paymentState === "succeeded");

        const latestEvent = String(shipment?.latestEventLabel || "").trim();
        this.latestEvent.hidden = !latestEvent;
        if (latestEvent) {
            this.set("[data-latest-event-label]", latestEvent);
            const latestDate = dateTime(shipment?.latestEventAt);
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
            this.trackingNumber.textContent = `N° de colis ${trackingNumber}`;
        }
    }

    private renderResumePayment(order: RecordValue, line: RecordValue, paymentState: PaymentState): void {
        const orderId = positiveIdentifier(order.id);
        const offerId = positiveIdentifier(line.offerId);
        const payable = isPayableOrder(order.status, paymentState) && Boolean(orderId && offerId);
        this.resumePaymentAction.hidden = !payable;
        if (!payable) {
            this.resumePayment.removeAttribute("href");
            return;
        }
        const query = new URLSearchParams({ offerId: offerId!, orderId: orderId! });
        this.resumePayment.setAttribute("href", `/checkout?${query.toString()}`);
    }

    private renderRelay(relay: RecordValue | null, shipment: RecordValue | null): void {
        this.set("[data-relay-name]", relay?.name || "Point relais à confirmer");
        this.set("[data-relay-address]", relayAddress(relay));
        const selectedLocation = String(relay?.relayLocation || relay?.location || "").trim();
        const shipmentLocation = String(shipment?.deliveryRelayLocation || "").trim();
        const shipmentConfirmed =
            Boolean(shipmentLocation) &&
            !["creating", "failed", "unknown", "cancelled"].includes(String(shipment?.status));
        let label = "Point relais choisi lors de la commande";
        let state = "neutral";
        if (selectedLocation && shipmentLocation && selectedLocation !== shipmentLocation) {
            label = "La destination du colis ne correspond pas au point relais choisi";
            state = "danger";
        } else if (shipmentConfirmed && selectedLocation === shipmentLocation) {
            label = "Destination enregistrée sur l’expédition";
            state = "success";
        } else if (shipmentLocation) {
            label = "Confirmation du point relais en attente";
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

    private syncPresentation(): void {
        for (const [attribute, property] of [
            ["accent-color", "--order-accent"],
            ["background-color", "--order-background"],
            ["border-color", "--order-border"],
            ["text-color", "--order-text"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                this.style.setProperty(property, value);
            } else {
                this.style.removeProperty(property);
            }
        }
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
            "Impossible de charger la commande. Réessaie dans quelques instants.",
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

function amountOrPending(amount: number | null, currency: unknown): string {
    return amount === null ? "À calculer" : money(amount, currency);
}
function priceOrPending(amount: number | null, currency: unknown): string {
    return amount === null ? "À calculer" : price(amount, currency);
}

function recordValue(value: unknown): RecordValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null;
}

function minorAmount(value: unknown): number | null {
    const amount =
        typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function money(amount: number, currency: unknown): string {
    if (!Number.isSafeInteger(amount)) {
        return "—";
    }
    try {
        return new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: String(currency || "EUR").toUpperCase(),
        }).format(amount / 100);
    } catch {
        return `${(amount / 100).toFixed(2)} €`;
    }
}
function price(amount: number, currency: unknown): string {
    if (!Number.isSafeInteger(amount)) {
        return "—";
    }
    const rounded = Math.round(amount / 100);
    try {
        return new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: String(currency || "EUR").toUpperCase(),
            maximumFractionDigits: 0,
        }).format(rounded);
    } catch {
        return `${rounded} €`;
    }
}
function date(value: unknown): string {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime())
        ? "—"
        : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(parsed);
}
function dateTime(value: unknown): string {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime())
        ? ""
        : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
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
            missing: { label: "Paiement non commencé", tone: "pending" },
            created: { label: "Paiement en attente", tone: "pending" },
            requires_action: { label: "Paiement à finaliser", tone: "pending" },
            processing: { label: "Paiement en cours de confirmation", tone: "pending" },
            succeeded: { label: "Paiement confirmé", tone: "success" },
            failed: { label: "Paiement en échec", tone: "danger" },
            cancelled: { label: "Paiement annulé", tone: "danger" },
            manual_review: { label: "Paiement en vérification", tone: "neutral" },
            refunded: { label: "Paiement remboursé", tone: "neutral" },
            partially_refunded: { label: "Paiement partiellement remboursé", tone: "neutral" },
            disputed: { label: "Paiement contesté", tone: "neutral" },
            unknown: { label: "Statut du paiement indisponible", tone: "neutral" },
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
        return { label: "Annulée", tone: "danger" };
    }
    if (order === "cancellation_pending") {
        return { label: "Annulation en cours", tone: "progress" };
    }
    if (order === "expired") {
        return { label: "Expirée", tone: "neutral" };
    }
    if (order === "completed") {
        return { label: "Terminée", tone: "success" };
    }
    if (order === "awaiting_quote") {
        return { label: "Livraison à finaliser", tone: "progress" };
    }
    if (order === "awaiting_payment") {
        if (payment === "processing") {
            return { label: "Paiement en cours", tone: "progress" };
        }
        if (payment === "manual_review" || payment === "disputed") {
            return { label: "Paiement en vérification", tone: "progress" };
        }
        if (payment === "failed") {
            return { label: "Paiement en échec", tone: "danger" };
        }
        if (payment === "cancelled") {
            return { label: "Paiement annulé", tone: "danger" };
        }
        if (["missing", "created", "requires_action"].includes(payment)) {
            return { label: "Paiement en attente", tone: "progress" };
        }
        return { label: "Statut indisponible", tone: "neutral" };
    }
    if (order !== "active") {
        return { label: "Statut indisponible", tone: "neutral" };
    }
    if (shipment === "delivered") {
        return { label: "Livrée", tone: "success" };
    }
    if (shipment === "in_transit") {
        return { label: "En livraison", tone: "progress" };
    }
    if (shipment === "incident") {
        return { label: "Incident de livraison", tone: "danger" };
    }
    if (shipment === "failed") {
        return { label: "Expédition à finaliser", tone: "danger" };
    }
    if (shipment === "unknown") {
        return { label: "Suivi à confirmer", tone: "progress" };
    }
    return payment === "succeeded"
        ? { label: "Commande confirmée", tone: "success" }
        : payment === "unknown"
          ? { label: "Statut indisponible", tone: "neutral" }
          : { label: "Commande en vérification", tone: "progress" };
}
function shipmentPresentation(
    payment: PaymentState,
    shipment: unknown,
): { title: string; description: string; stage: number } {
    if (payment === "processing") {
        return {
            title: "Paiement en cours de confirmation",
            description: "La préparation commencera dès que le paiement sera confirmé.",
            stage: 0,
        };
    }
    if (payment === "manual_review" || payment === "disputed" || payment === "failed") {
        return {
            title: "Paiement en vérification",
            description: "La préparation est suspendue pendant la vérification du paiement.",
            stage: 0,
        };
    }
    if (payment === "cancelled") {
        return { title: "Paiement annulé", description: "Cette commande ne peut pas être préparée.", stage: 0 };
    }
    if (payment === "refunded" || payment === "partially_refunded") {
        return {
            title: "Commande remboursée",
            description: "Aucune nouvelle expédition ne sera préparée pour cette commande.",
            stage: 0,
        };
    }
    if (payment === "unknown") {
        return {
            title: "Suivi indisponible",
            description: "Le statut du paiement ne permet pas encore d’afficher la livraison.",
            stage: 0,
        };
    }
    if (payment !== "succeeded") {
        return {
            title: "En attente de paiement",
            description: "La préparation commencera dès que le paiement sera confirmé.",
            stage: 0,
        };
    }
    if (shipment === "delivered") {
        return { title: "Colis livré", description: "Ton colis a été livré au point relais sélectionné.", stage: 3 };
    }
    if (shipment === "in_transit") {
        return {
            title: "Colis en cours d’acheminement",
            description: "Ton colis est pris en charge par Mondial Relay.",
            stage: 2,
        };
    }
    if (shipment === "incident") {
        return {
            title: "Incident signalé pendant la livraison",
            description: "Le dernier événement connu est affiché ci-dessous.",
            stage: 2,
        };
    }
    if (shipment === "failed") {
        return {
            title: "Expédition à finaliser",
            description: "Le colis n’est pas encore confirmé comme expédié.",
            stage: 1,
        };
    }
    if (shipment === "unknown") {
        return {
            title: "Statut de l’expédition à confirmer",
            description: "Nous attendons une confirmation de Mondial Relay.",
            stage: 1,
        };
    }
    if (shipment === "cancelled") {
        return { title: "Expédition annulée", description: "Le colis n’est pas en cours d’acheminement.", stage: 1 };
    }
    if (shipment === "created" || shipment === "label_ready" || shipment === "creating") {
        return { title: "Expédition en préparation", description: "Le colis va être remis à Mondial Relay.", stage: 1 };
    }
    return {
        title: "Commande en préparation",
        description: "Le suivi apparaîtra ici dès la création de l’expédition.",
        stage: 1,
    };
}
function positiveIdentifier(value: unknown): string | null {
    const identifier = String(value ?? "").trim();
    return /^\d+$/.test(identifier) && BigInt(identifier) > 0n ? identifier : null;
}
function relayAddress(relay: RecordValue | null): string {
    if (!relay) {
        return "Adresse du point relais indisponible";
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
    return (
        (
            {
                new: "Neuf",
                like_new: "Comme neuf",
                very_good: "Très bon état",
                good: "Bon état",
                fair: "État correct",
                poor: "État usé",
            } as Record<string, string>
        )[String(value)] || String(value || "").replaceAll("_", " ")
    );
}
function safeHttpUrl(value: unknown): string {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
        return "";
    }
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
    return error instanceof RemoteRequestError && isFrenchUserMessage(error.message) ? error.message : fallback;
}
function responseMessage(body: unknown): string {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "";
    }
    const value = (body as RecordValue).error ?? (body as RecordValue).message;
    return typeof value === "string" ? value.trim() : "";
}
function isFrenchUserMessage(value: string): boolean {
    return /[àâçéèêëîïôùûüÿœ]|\b(?:le|la|les|un|une|des|du|de|au|aux|ton|ta|tes|votre|vos|commande|paiement|livraison|adresse|relais|colis|expédition)\b/i.test(
        value,
    );
}
