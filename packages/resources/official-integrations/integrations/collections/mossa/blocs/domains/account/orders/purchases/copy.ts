export const purchaseCopy: Record<string, { selector: string; text: string; attribute?: string }> = {
    "empty-title": { selector: "[data-empty] [slot=title]", text: "No purchases yet" },
    "empty-description": {
        selector: "[data-empty] [slot=description]",
        text: "Your orders will appear here after your first purchase.",
    },
    "login-title": { selector: "[data-login] [slot=title]", text: "Sign in to view your purchases" },
    "login-description": {
        selector: "[data-login] [slot=description]",
        text: "Order history is available only from your account.",
    },
    "error-title": { selector: "[data-error] [slot=title]", text: "Your purchases could not be loaded" },
    "error-message": {
        selector: "[data-error-message]",
        text: "Your purchases could not be loaded. Try again shortly.",
    },
    "loading-label": { selector: "[data-loading] mossa-skeleton", attribute: "label", text: "Loading purchases" },
    "pagination-label": { selector: "[data-pagination]", attribute: "aria-label", text: "Purchase pagination" },
};

export const purchaseLabels: Record<string, string> = {
    "placed-on-template": "Placed on {date}",
    "order-reference-template": "Order {id}",
    "other-item-template": "{title} + {count} other",
    "other-items-template": "{title} + {count} others",
    "unknown-date-label": "unknown date",
    "total-label": "Total",
    "pagination-summary-template": "Page {page} of {pages}",
    "pagination-tone": "neutral",
    "label-review-required": "Review required",
    "label-dispute-in-progress": "Dispute in progress",
    "label-refund-in-progress": "Refund in progress",
    "label-refunded": "Refunded",
    "label-partially-refunded": "Partially refunded",
    "label-payment-failed": "Payment failed",
    "label-payment-cancelled": "Payment cancelled",
    "label-payment-pending": "Payment pending",
    "label-awaiting_quote": "Delivery to complete",
    "label-awaiting_payment": "Payment pending",
    "label-active": "Order in progress",
    "label-completed": "Completed",
    "label-expired": "Expired",
    "label-cancellation_pending": "Cancellation in progress",
    "label-cancelled": "Cancelled",
    "label-unavailable": "Status unavailable",
};

export function purchaseText(
    host: HTMLElement,
    attribute: string,
    values: Record<string, string | number> = {},
): string {
    let text = host.getAttribute(attribute)?.trim() || purchaseLabels[attribute] || "";
    for (const [key, value] of Object.entries(values)) {
        text = text.replaceAll(`{${key}}`, String(value));
    }
    return text;
}

export function syncPurchaseCopy(host: HTMLElement): void {
    for (const [attribute, field] of Object.entries(purchaseCopy)) {
        const element = host.shadowRoot?.querySelector(field.selector);
        const value = host.getAttribute(attribute)?.trim() || field.text;
        if (field.attribute) {
            element?.setAttribute(field.attribute, value);
        } else if (element) {
            element.textContent = value;
        }
    }
}
