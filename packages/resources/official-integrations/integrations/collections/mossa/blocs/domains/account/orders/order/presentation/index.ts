import { readOrderCopy } from "../copy";
import { progressSteps, relayPresentation, shipmentPresentation } from "./shipment";
import { normalizedPaymentState, orderPresentation, paymentPresentation } from "./status";
import { longDate, minorAmount, objectValue, objectValues, routeUrl, safeHttpUrl, type ObjectValue } from "./value";

export type OrderSources = { offer: unknown; payment: unknown; relay: unknown; shipment: unknown };

export function projectOrder(host: HTMLElement, orderValue: unknown, sources: OrderSources): Record<string, unknown> {
    const order = objectValue(orderValue) || {};
    const line = objectValue(objectValues(order.lines)[0]) || {};
    const payment = objectValue(objectValue(sources.payment)?.payment);
    const relay = objectValue(sources.relay);
    const shipment = objectValue(objectValues(objectValue(sources.shipment)?.shipments)[0]);
    const offer = objectValue(sources.offer);
    const copy = (name: string, values: Record<string, string> = {}) => readOrderCopy(host, name, values);
    const paymentState = normalizedPaymentState(payment, order);
    const orderState = orderPresentation(order.status, paymentState, shipment?.status, copy);
    const paymentStateCopy = paymentPresentation(paymentState, copy);
    const shipmentCopy = shipmentPresentation(paymentState, shipment?.status, copy);
    const financial = financialBreakdown(order);
    const liveImage = offerImage(offer);
    const image = liveImage || objectValue(objectValue(line.offerSnapshot)?.media);
    const relayState = relayPresentation(relay, shipment, copy);
    const progressTone = colorTone(host.getAttribute("progress-tone"), "primary");
    return {
        currency: financial.currency,
        deliveryEstimate:
            shipment?.status === "delivered"
                ? copy("delivery-completed-label")
                : host.getAttribute("delivery-estimate-label") ||
                  "Typical delivery time: 3 to 5 business days after shipment.",
        deliveryLabel: copy("delivery-label"),
        errorMessage: copy("error-message"),
        errorTitle: copy("error-title"),
        estimateLabel: copy("estimate-label"),
        imageAccess: liveImage ? "public" : "private",
        imageHeight: image?.height,
        imageUrl: image?.id
            ? `/.cms/sources/commerce/${liveImage ? "publicOfferImage" : "myOrderImage"}?id=${encodeURIComponent(String(image.id))}`
            : "",
        imageWidth: image?.width,
        itemHeading: copy("item-heading"),
        itemLabel: copy("item-label"),
        latestEventAt: shipment?.latestEventAt || "",
        latestEventLabel: shipment?.latestEventLabel || "",
        lineAmount: minorAmount(line.totalAmount ?? order.subtotalAmount),
        lineCondition: conditionText(line, copy),
        lineTitle: line.title || objectValue(line.offerSnapshot)?.title || copy("item-label"),
        lineVariant: variantLabel(objectValue(line.variantSnapshot)),
        loadingLabel: copy("loading-label"),
        orderDate: copy("order-date-label", { date: longDate(order.createdAt, locale(host)) }),
        orderEyebrow: copy("order-eyebrow"),
        orderNumber:
            order.orderNumber || copy("order-reference-label", { reference: String(order.publicId || order.id || "") }),
        orderStatusLabel: orderState.label,
        orderStatusTone: orderState.tone,
        paymentLabel: paymentStateCopy.label,
        paymentTone: paymentStateCopy.tone,
        progress: progressSteps(shipmentCopy.stage, paymentState === "succeeded", copy, progressTone),
        progressLabel: copy("progress-label"),
        progressTone,
        progressWidth: `${paymentState === "succeeded" ? Math.max(0, Math.min(3, shipmentCopy.stage)) * 25 : 0}%`,
        protectionAmount: financial.protection,
        protectionLabel: copy("protection-label"),
        relayAddress: relayAddress(relay, copy),
        relayHeading: copy("relay-heading"),
        relayLabel: relayState.label,
        relayName: relay?.name || copy("relay-pending-label"),
        relayProviderLabel: copy("relay-provider-label"),
        relayTone: relayState.tone,
        resumeActionLabel: copy("resume-action-label"),
        resumeUrl: resumeUrl(host, order, line, paymentState),
        shipmentDescription: shipmentCopy.description,
        shipmentTitle: shipmentCopy.title,
        shippingAmount: financial.shipping,
        subtotalAmount: financial.subtotal,
        summaryHeading: copy("summary-heading"),
        totalAmount: financial.total,
        totalLabel: copy("total-label"),
        trackingActionLabel: copy("tracking-action-label"),
        trackingNumber: shipment?.expeditionNumber || "",
        trackingNumberLabel: copy("tracking-number-label", { number: String(shipment?.expeditionNumber || "") }),
        trackingUrl: safeHttpUrl(shipment?.trackingUrl),
    };
}

function colorTone(value: string | null, fallback: string): string {
    return ["primary", "secondary", "success", "warning", "danger", "info"].includes(value || "")
        ? String(value)
        : fallback;
}

function financialBreakdown(order: ObjectValue) {
    const terms = objectValue(order.financialTerms) || {};
    const subtotal = minorAmount(terms.merchandiseSubtotalAmount) ?? minorAmount(order.subtotalAmount);
    const shipping = minorAmount(terms.shippingAmount);
    const total = minorAmount(terms.buyerTotalAmount) ?? minorAmount(order.totalAmount);
    const explicitProtection = minorAmount(terms.buyerProtectionFeeAmount);
    const derivedProtection =
        subtotal !== null && shipping !== null && total !== null && total >= subtotal + shipping
            ? total - subtotal - shipping
            : null;
    return {
        subtotal,
        shipping,
        protection: explicitProtection ?? derivedProtection,
        total,
        currency: String(terms.currency || order.currency || "USD"),
    };
}

function offerImage(offer: ObjectValue | null): ObjectValue | null {
    const media = objectValues(offer?.media).sort(
        (left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0),
    );
    return objectValue((media.find((item) => item.isMain) || media[0])?.media);
}

function conditionText(line: ObjectValue, copy: (name: string, values?: Record<string, string>) => string): string {
    const snapshot = objectValue(line.offerSnapshot);
    const explicit = String(snapshot?.conditionLabel || "").trim();
    const code = String(snapshot?.conditionCode || "").replaceAll("_", "-");
    const label = explicit || copy(`condition-${code}-label`) || humanize(code);
    return label ? copy("condition-label", { condition: label }) : "";
}

function variantLabel(snapshot: ObjectValue | null): string {
    const options = objectValues(snapshot?.options);
    return options.length
        ? options.map((item) => `${item.axisLabel || item.axisKey}: ${item.valueLabel || item.valueKey}`).join(" · ")
        : String(snapshot?.title || "");
}

function relayAddress(relay: ObjectValue | null, copy: (name: string) => string): string {
    return relay
        ? [relay.addressLine1, relay.addressLine2, [relay.postalCode, relay.city].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(", ")
        : copy("relay-address-unavailable-label");
}

function resumeUrl(host: HTMLElement, order: ObjectValue, line: ObjectValue, payment: string): string {
    const payable =
        (order.status === "awaiting_quote" && payment === "missing") ||
        (order.status === "awaiting_payment" && ["missing", "created", "requires_action"].includes(payment));
    return payable ? routeUrl(host.getAttribute("checkout-url"), { orderId: order.id, offerId: line.offerId }) : "";
}

function locale(host: HTMLElement): string {
    return host.ownerDocument.documentElement.lang || host.ownerDocument.defaultView?.navigator.language || "en-US";
}

function humanize(value: string): string {
    const words = value.trim().replaceAll(/[_-]+/g, " ");
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}
