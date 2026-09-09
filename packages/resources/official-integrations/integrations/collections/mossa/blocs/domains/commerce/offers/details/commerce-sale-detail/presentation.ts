type ObjectValue = Record<string, unknown>;

const copy = {
    "articles-title": "Sold items",
    "commission-label": "Platform commission",
    "date-prefix": "Sold on",
    "error-message": "This sale could not be loaded.",
    "error-title": "Sale not found",
    eyebrow: "SALE",
    "fallback-article-label": "Item",
    "platform-shipping-label": "Covered by the platform",
    "order-reference-template": "Order {reference}",
    "quantity-label": "Quantity",
    "shipping-label": "Delivery",
    "subtotal-label": "Sale price",
    "summary-title": "Summary",
    "total-label": "Net amount to receive",
};

const statusDefaults: Record<string, string> = {
    placed: "To process",
    awaiting_quote: "Delivery to complete",
    awaiting_payment: "Payment pending",
    active: "To ship",
    seller_handoff_declared: "Handoff declared",
    carrier_accepted: "Accepted by carrier",
    in_transit: "In transit",
    arrived_at_pickup_point: "Arrived at pickup point",
    available_for_pickup: "Available at pickup point",
    collected_by_recipient: "Delivered",
    incident: "Delivery incident",
    lost: "Parcel lost",
    pickup_expired: "Pickup expired",
    returning_to_sender: "Return in progress",
    returned_to_sender: "Returned to seller",
    manual_review: "Review required",
    cancellation_pending: "Cancellation in progress",
    expired: "Expired",
    completed: "Completed",
    cancelled: "Cancelled",
    archived: "Archived",
};

export const salePresentationAttributes = [
    "card-appearance",
    "show-order-reference",
    "title",
    ...Object.keys(copy),
    ...Object.keys(statusDefaults).map((status) => `label-${status}`),
];

export function projectSale(host: HTMLElement, value: unknown): Record<string, unknown> {
    const sale = objectValue(value) || {};
    const fulfillment = objectValue(sale.fulfillment) || {};
    const financial = objectValue(sale.financialTerms) || {};
    const currency = String(financial.currency || sale.currency || "USD");
    const status = presentationStatus(sale.status, fulfillment.status);
    const shipping = shippingPresentation(host, sale, financial);
    const lines = objectValues(sale.lines).map((line) => projectLine(host, line));
    const orderNumber = String(sale.orderNumber || sale.publicId || `Sale ${sale.id || ""}`);
    const orderReference = text(host, "order-reference-template").replaceAll("{reference}", orderNumber);
    const authoredTitle = host.getAttribute("title")?.trim() || "";
    const showOrderReference = host.getAttribute("show-order-reference") !== "false";
    return {
        articlesTitle: text(host, "articles-title"),
        cardAppearance: host.getAttribute("card-appearance") || "outlined",
        commissionAmount: negativeAmount(financial.sellerCommissionAmount),
        commissionLabel: text(host, "commission-label"),
        currency,
        errorMessage: text(host, "error-message"),
        errorTitle: text(host, "error-title"),
        eyebrow: text(host, "eyebrow"),
        heading: authoredTitle || (showOrderReference ? orderReference : lines[0]?.title) || "Sale details",
        lines,
        orderDate: `${text(host, "date-prefix")} ${formatDate(sale.createdAt, locale(host))}`,
        orderReference,
        referenceInSubtitle: showOrderReference && Boolean(authoredTitle),
        proceedsAmount: minorAmount(financial.sellerProceedsAmount),
        shippingAmount: shipping.amount,
        shippingCovered: shipping.covered,
        shippingLabel: text(host, "shipping-label"),
        shippingValueLabel: text(host, "platform-shipping-label"),
        showOrderReference,
        statusLabel: host.getAttribute(`label-${status}`)?.trim() || statusDefaults[status] || "To review",
        statusTone: statusTone(status),
        subtotalAmount: minorAmount(financial.merchandiseSubtotalAmount) ?? minorAmount(sale.subtotalAmount),
        subtotalLabel: text(host, "subtotal-label"),
        summaryTitle: text(host, "summary-title"),
        totalLabel: text(host, "total-label"),
    };
}

function projectLine(host: HTMLElement, line: ObjectValue): Record<string, unknown> {
    const offer = objectValue(line.offerSnapshot) || {};
    const variant = objectValue(line.variantSnapshot);
    const quantity = positiveInteger(line.quantity);
    const details = [
        variantLabel(variant),
        quantity > 1 ? `${text(host, "quantity-label")}: ${quantity}` : "",
        String(offer.conditionLabel || "").trim() || humanize(offer.conditionCode),
    ].filter(Boolean);
    return {
        meta: details.join(" · "),
        title: line.title || offer.title || text(host, "fallback-article-label"),
        totalAmount: minorAmount(line.totalAmount),
    };
}

function shippingPresentation(host: HTMLElement, sale: ObjectValue, financial: ObjectValue) {
    const total = minorAmount(financial.shippingAmount) ?? minorAmount(sale.shippingAmount);
    const seller = minorAmount(financial.sellerShippingShareAmount);
    const platform = minorAmount(financial.platformShippingShareAmount);
    if (total === null || seller === null || platform === null || seller + platform !== total) {
        return { amount: null, covered: false };
    }
    if (seller > 0 || total === 0) {
        return { amount: seller, covered: false };
    }
    return { amount: null, covered: platform === total && Boolean(text(host, "platform-shipping-label")) };
}

function presentationStatus(orderStatus: unknown, fulfillmentStatus: unknown): string {
    const order = String(orderStatus || "unknown");
    const fulfillment = String(fulfillmentStatus || "");
    return order === "active" && statusDefaults[fulfillment] && fulfillment !== "active" ? fulfillment : order;
}

function statusTone(status: string): string {
    if (["completed", "collected_by_recipient"].includes(status)) {
        return "success";
    }
    if (["cancelled", "expired", "incident", "lost"].includes(status)) {
        return "danger";
    }
    return ["awaiting_quote", "awaiting_payment", "manual_review", "cancellation_pending"].includes(status)
        ? "warning"
        : "primary";
}

function variantLabel(snapshot: ObjectValue | null): string {
    const options = objectValues(snapshot?.options);
    return options.length
        ? options
              .map((option) =>
                  [option.axisLabel || option.axisKey, option.valueLabel || option.valueKey].filter(Boolean).join(": "),
              )
              .filter(Boolean)
              .join(" · ")
        : String(snapshot?.title || "");
}

function text(host: HTMLElement, name: keyof typeof copy): string {
    return host.getAttribute(name)?.trim() || copy[name];
}

function formatDate(value: unknown, language: string): string {
    const date = new Date(String(value || ""));
    return Number.isNaN(date.getTime())
        ? "Date unavailable"
        : new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(date);
}

function locale(host: HTMLElement): string {
    return host.ownerDocument.documentElement.lang || host.ownerDocument.defaultView?.navigator.language || "en-US";
}

function humanize(value: unknown): string {
    const words = String(value || "")
        .trim()
        .replaceAll(/[_-]+/g, " ");
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

function negativeAmount(value: unknown): number | null {
    const amount = minorAmount(value);
    return amount === null || amount === 0 ? amount : -amount;
}

function minorAmount(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function positiveInteger(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function objectValue(value: unknown): ObjectValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : null;
}

function objectValues(value: unknown): ObjectValue[] {
    return Array.isArray(value) ? value.map(objectValue).filter((item): item is ObjectValue => item !== null) : [];
}
