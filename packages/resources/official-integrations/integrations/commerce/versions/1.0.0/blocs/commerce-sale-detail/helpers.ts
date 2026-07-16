export const saleStatusDefaults = {
    placed: "À traiter",
    awaiting_payment: "Paiement en attente",
    active: "À expédier",
    seller_handoff_declared: "Dépôt déclaré",
    carrier_accepted: "Pris en charge",
    in_transit: "En transit",
    arrived_at_pickup_point: "Arrivé au point relais",
    available_for_pickup: "Disponible au point relais",
    collected_by_recipient: "Livrée",
    incident: "Incident de livraison",
    lost: "Colis perdu",
    pickup_expired: "Retrait expiré",
    returning_to_sender: "Retour en cours",
    returned_to_sender: "Retournée au vendeur",
    manual_review: "Vérification nécessaire",
    cancellation_pending: "Annulation en cours",
    expired: "Expirée",
    completed: "Terminée",
    cancelled: "Annulée",
    archived: "Archivée",
};

export function salePresentationStatus(order) {
    const orderStatus = String(order?.status || "unknown");
    if (orderStatus !== "active") return orderStatus;
    const fulfillmentStatus = String(order?.fulfillment?.status || order?.fulfillmentStatus || "");
    return Object.hasOwn(saleStatusDefaults, fulfillmentStatus) && fulfillmentStatus !== "active"
        ? fulfillmentStatus
        : orderStatus;
}

export function formatMoney(amount, currency, locale = "fr-FR", signDisplay = "auto") {
    const value = Number(amount);
    if (!Number.isSafeInteger(value)) return "—";
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: String(currency || "EUR").toUpperCase(),
            signDisplay,
        }).format(value / 100);
    } catch {
        const sign = signDisplay === "always" && value >= 0 ? "+" : "";
        return `${sign}${(value / 100).toFixed(2)} ${String(currency || "EUR").toUpperCase()}`;
    }
}

export function formatDate(value, locale = "fr-FR") {
    const date = new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) return "Date indisponible";
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

export function variantLabel(snapshot) {
    const options = Array.isArray(snapshot?.options) ? snapshot.options : [];
    if (options.length) return options.map(option => {
        const axis = option.axisLabel || option.axisKey;
        const value = option.valueLabel || option.valueKey;
        return [axis, value].filter(Boolean).join(" : ");
    }).filter(Boolean).join(" · ");
    return String(snapshot?.title || "");
}

export function conditionLabel(code) {
    const labels = {
        new: "Neuf", like_new: "Comme neuf", very_good: "Très bon état",
        good: "Bon état", fair: "État correct", poor: "État usé",
    };
    return labels[String(code || "")] || String(code || "").replaceAll("_", " ");
}

export function shippingAmount(order) {
    const snapshot = order?.financialTerms?.shippingAmount;
    if (Number.isSafeInteger(snapshot) && snapshot >= 0) return snapshot;
    const explicit = Number(order?.shippingAmount);
    if (Number.isSafeInteger(explicit) && explicit >= 0) return explicit;
    return NaN;
}

export function sellerProceedsAmount(order) {
    return financialAmount(order, "sellerProceedsAmount");
}

export function sellerMerchandiseAmount(order) {
    const amount = financialAmount(order, "merchandiseSubtotalAmount");
    if (Number.isSafeInteger(amount)) return amount;
    const fallback = Number(order?.subtotalAmount);
    return Number.isSafeInteger(fallback) && fallback >= 0 ? fallback : NaN;
}

export function sellerCommissionAmount(order) {
    return financialAmount(order, "sellerCommissionAmount");
}

export function platformShippingShareAmount(order) {
    return financialAmount(order, "platformShippingShareAmount");
}

export function sellerShippingShareAmount(order) {
    return financialAmount(order, "sellerShippingShareAmount");
}

function financialAmount(order, field) {
    const value = order?.financialTerms?.[field];
    return Number.isSafeInteger(value) && value >= 0 ? value : NaN;
}

export function errorMessage(error, fallback) {
    const message = error instanceof Error ? error.message : String(error || "");
    return /cms|api key/i.test(message) ? fallback : message || fallback;
}
