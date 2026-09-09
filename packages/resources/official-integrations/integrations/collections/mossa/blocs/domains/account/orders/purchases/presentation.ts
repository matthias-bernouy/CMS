import { purchaseText } from "./copy";

type ObjectValue = Record<string, unknown>;

export function purchasePresentation(host: HTMLElement, value: unknown, offset: number): Record<string, unknown> {
    const response = objectValue(value) || {};
    return {
        emptyDescription: purchaseText(host, "empty-description"),
        emptyTitle: purchaseText(host, "empty-title"),
        errorMessage: purchaseText(host, "error-message"),
        errorTitle: purchaseText(host, "error-title"),
        items: objectValues(response.items).map((order) => purchaseItem(host, order)),
        loadingLabel: purchaseText(host, "loading-label"),
        loginDescription: purchaseText(host, "login-description"),
        loginTitle: purchaseText(host, "login-title"),
        page: Math.floor(offset / 8) + 1,
        paginationLabel: purchaseText(host, "pagination-label"),
        paginationNextLabel: purchaseText(host, "pagination-next-label"),
        paginationPreviousLabel: purchaseText(host, "pagination-previous-label"),
        paginationSummary: purchaseText(host, "pagination-summary-template"),
        total: nonNegativeInteger(response.total),
    };
}

function purchaseItem(host: HTMLElement, order: ObjectValue): Record<string, unknown> {
    const operation = objectValue(order.operation) || {};
    const summary = objectValue(order.lineSummary) || {};
    const count = nonNegativeInteger(summary.lineCount);
    const firstTitle = String(summary.firstTitle || "").trim();
    const reference = String(
        order.orderNumber || purchaseText(host, "order-reference-template", { id: order.id || "" }),
    );
    const date = formatDate(order.createdAt, locale(host), purchaseText(host, "unknown-date-label"));
    const title =
        firstTitle && count > 1
            ? purchaseText(host, count > 2 ? "other-items-template" : "other-item-template", {
                  title: firstTitle,
                  count: count - 1,
              })
            : firstTitle || reference;
    const status = orderStatus(order.status, operation);
    return {
        actionLabel: purchaseText(host, "order-action-label"),
        actionUrl: routeUrl(host.getAttribute("order-url"), { orderId: order.id }),
        currency: order.currency,
        meta: purchaseText(host, "placed-on-template", { date }),
        statusLabel: purchaseText(host, `label-${status.key}`),
        statusTone: status.tone,
        title,
        totalAmount: order.totalAmount,
        totalLabel: purchaseText(host, "total-label"),
    };
}

function orderStatus(status: unknown, operation: ObjectValue): { key: string; tone: string } {
    const settlement = String(operation.settlementStatus || "").toLowerCase();
    const payment = String(operation.paymentStatus || "").toLowerCase();
    const claim = String(operation.claimStatus || "").toLowerCase();
    if (settlement === "manual_review" || settlement === "blocked") {
        return { key: "review-required", tone: "danger" };
    }
    if (claim && !["resolved_buyer", "resolved_seller", "resolved_split"].includes(claim)) {
        return { key: "dispute-in-progress", tone: "warning" };
    }
    if (["refund_pending", "reversal_pending"].includes(settlement)) {
        return { key: "refund-in-progress", tone: "warning" };
    }
    if (settlement === "refunded" || settlement === "reversed" || payment === "refunded") {
        return { key: "refunded", tone: "info" };
    }
    if (payment === "partially_refunded") {
        return { key: "partially-refunded", tone: "info" };
    }
    if (["failed", "cancelled", "canceled"].includes(payment)) {
        return { key: payment === "failed" ? "payment-failed" : "payment-cancelled", tone: "danger" };
    }
    if (["created", "requires_action", "requires_payment_method", "processing"].includes(payment)) {
        return { key: "payment-pending", tone: "warning" };
    }
    return statusPresentation[String(status)] || { key: "unavailable", tone: "info" };
}

const statusPresentation: Record<string, { key: string; tone: string }> = {
    awaiting_quote: { key: "awaiting_quote", tone: "warning" },
    awaiting_payment: { key: "awaiting_payment", tone: "warning" },
    active: { key: "active", tone: "primary" },
    completed: { key: "completed", tone: "success" },
    expired: { key: "expired", tone: "info" },
    cancellation_pending: { key: "cancellation_pending", tone: "warning" },
    cancelled: { key: "cancelled", tone: "danger" },
};

function formatDate(value: unknown, language: string, fallback: string): string {
    const date = new Date(String(value || ""));
    return Number.isNaN(date.getTime())
        ? fallback
        : new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(date);
}

function locale(host: HTMLElement): string {
    return host.ownerDocument.documentElement.lang || host.ownerDocument.defaultView?.navigator.language || "en-US";
}

function routeUrl(template: string | null, values: Record<string, unknown>): string {
    return Object.entries(values).reduce(
        (result, [key, value]) => result.replaceAll(`{${key}}`, encodeURIComponent(String(value ?? ""))),
        template || "",
    );
}

function objectValue(value: unknown): ObjectValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : null;
}

function objectValues(value: unknown): ObjectValue[] {
    return Array.isArray(value) ? value.map(objectValue).filter((item): item is ObjectValue => item !== null) : [];
}

function nonNegativeInteger(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
