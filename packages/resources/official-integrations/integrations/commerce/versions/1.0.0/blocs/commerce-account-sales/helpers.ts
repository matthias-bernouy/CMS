export const saleStatuses = [
    "all",
    "awaiting_quote",
    "awaiting_payment",
    "active",
    "completed",
    "cancellation_pending",
    "cancelled",
    "expired",
];

export const saleStatusDefaults = {
    awaiting_quote: "Livraison à finaliser",
    awaiting_payment: "Paiement en attente",
    active: "À expédier",
    completed: "Terminée",
    cancellation_pending: "Annulation en cours",
    cancelled: "Annulée",
    expired: "Expirée",
};

export const saleFilterDefaults = {
    all: "Toutes",
    awaiting_quote: "Livraison à finaliser",
    awaiting_payment: "Paiement en attente",
    active: "À expédier",
    completed: "Terminées",
    cancellation_pending: "Annulation en cours",
    cancelled: "Annulées",
    expired: "Expirées",
};

export function lineSummaryLabel(value) {
    const summary = value?.lineSummary;
    const title = typeof summary?.firstTitle === "string" ? summary.firstTitle.trim() : "";
    if (!title) {
        return "";
    }
    const lineCount = Number(summary?.lineCount);
    return Number.isSafeInteger(lineCount) && lineCount > 1
        ? `${title} + ${lineCount - 1} autre${lineCount > 2 ? "s" : ""}`
        : title;
}

export function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function formatMoney(amount, currency, locale = "fr-FR") {
    const value = Number(amount);
    if (!Number.isSafeInteger(value)) {
        return "—";
    }
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: String(currency || "EUR").toUpperCase(),
        }).format(value / 100);
    } catch {
        return `${(value / 100).toFixed(2)} ${String(currency || "EUR").toUpperCase()}`;
    }
}

export function formatDate(value, locale = "fr-FR") {
    const date = new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) {
        return "Date indisponible";
    }
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

export function saleDetailUrl(base, sale, parameter = "orderId") {
    const values = {
        id: String(sale?.id ?? ""),
        publicId: String(sale?.publicId ?? ""),
        orderNumber: String(sale?.orderNumber ?? ""),
    };
    if (/\{(?:id|publicId|orderNumber)\}/.test(base)) {
        return Object.entries(values).reduce(
            (url, [name, value]) => url.replaceAll(`{${name}}`, encodeURIComponent(value)),
            base,
        );
    }
    const url = new URL(base, "https://cms.invalid");
    if (values.id) {
        url.searchParams.set(parameter, values.id);
    }
    return `${url.pathname}${url.search}${url.hash}`;
}

export function errorMessage(error, fallback) {
    const message = error instanceof Error ? error.message : String(error || "");
    return /cms|api key/i.test(message) ? fallback : message || fallback;
}
