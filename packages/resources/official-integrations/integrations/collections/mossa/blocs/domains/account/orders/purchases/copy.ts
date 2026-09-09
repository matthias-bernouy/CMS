export const purchaseCopy: Record<string, string> = {
    "empty-title": "No purchases yet",
    "empty-description": "Your orders will appear here after your first purchase.",
    "login-title": "Sign in to view your purchases",
    "login-description": "Order history is available only from your account.",
    "error-title": "Your purchases could not be loaded",
    "error-message": "Your purchases could not be loaded. Try again shortly.",
    "loading-label": "Loading purchases",
    "pagination-label": "Purchase pagination",
    "pagination-previous-label": "Previous",
    "pagination-next-label": "Next",
    "pagination-summary-template": "Page {page} of {pages}",
    "placed-on-template": "Placed on {date}",
    "order-reference-template": "Order {id}",
    "other-item-template": "{title} + {count} other",
    "other-items-template": "{title} + {count} others",
    "unknown-date-label": "unknown date",
    "total-label": "Total",
    "order-action-label": "View order",
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
    values: Record<string, string | number | unknown> = {},
): string {
    let text = host.getAttribute(attribute)?.trim() || purchaseCopy[attribute] || "";
    for (const [key, value] of Object.entries(values)) {
        text = text.replaceAll(`{${key}}`, String(value ?? ""));
    }
    return text;
}
