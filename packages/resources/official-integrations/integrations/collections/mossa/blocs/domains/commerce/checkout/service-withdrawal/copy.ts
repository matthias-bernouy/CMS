export const withdrawalCopy: Record<string, string> = {
    "loading-label": "Loading orders",
    "form-title": "Exercise my right of withdrawal",
    "form-description":
        "This request concerns the platform service associated with an order. It does not automatically cancel the product sale or issue a refund: the request is recorded, timestamped, and reviewed under the applicable contract.",
    "order-label": "Related order",
    "reason-label": "Optional details",
    "reason-placeholder": "You may provide the reason or context for your request.",
    "confirmation-label":
        "I clearly confirm that I want to withdraw from the platform service associated with the selected order.",
    "terms-before-label": "Read the",
    "terms-after-label": "to understand the service scope and applicable rules.",
    "submit-label": "Confirm my request",
    "success-title": "Your request was recorded",
    "success-description":
        "Keep this receipt. The platform will separately review any contractual, logistical, and financial consequences.",
    "reference-label": "Request reference",
    "receipt-order-label": "Order",
    "date-label": "Date and time",
    "status-label": "Status",
    "download-label": "Download receipt",
    "order-reference-label": "Order {reference}",
    "select-order-message": "Select the related order.",
    "confirmation-required-message": "Explicitly confirm your request to continue.",
    "submit-error-message": "The request could not be recorded. Try again shortly.",
    "duplicate-request-message":
        "A request already exists for this order. Find it in your account or contact the platform team.",
    "order-unavailable-message": "This order could not be found or does not belong to your account.",
    "status-submitted-label": "Received",
    "status-under-review-label": "Under review",
    "status-information-requested-label": "Information requested",
    "status-resolved-label": "Resolved",
    "receipt-title": "Receipt — platform service withdrawal request",
    "receipt-reference-label": "Reference",
    "receipt-scope-label": "Scope",
    "receipt-unavailable-label": "unavailable",
    "receipt-notice":
        "This request is recorded for review. By itself, it does not prove that a cancellation, refund, or payment operation was completed.",
};

export function readWithdrawalCopy(host: HTMLElement, name: string, values: Record<string, string> = {}): string {
    const content = host.getAttribute(name)?.trim() || withdrawalCopy[name] || "";
    return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, value), content);
}
