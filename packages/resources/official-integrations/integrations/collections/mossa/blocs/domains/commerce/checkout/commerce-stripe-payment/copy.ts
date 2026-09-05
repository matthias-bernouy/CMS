export const paymentCopy = {
    "legal-title": "Contractual terms",
    "security-label": "Encrypted payment. Card details never pass through our servers.",
    "continue-label": "Continue to payment",
    "pay-label": "Pay",
    "pay-amount-label": "Pay {amount}",
    "legal-read-label": "Read {document}",
    "legal-version-label": "Version dated {date}",
    "checking-terms-message": "Checking contractual terms…",
    "preparing-message": "Preparing secure payment…",
    "loading-message": "Loading payment form…",
    "terms-changed-message": "Contractual terms changed. Review and accept the new version.",
    "confirming-message": "Confirming payment…",
    "verifying-message": "Verifying payment securely…",
    "processing-message": "Payment received and under review.",
    "refunded-message": "Payment refunded.",
    "partially-refunded-message": "Payment partially refunded.",
    "review-message": "Payment temporarily held for review.",
    "legal-required-message": "Accept all contractual terms to continue.",
    "legal-version-changed-message": "Contractual terms changed. Review them before continuing.",
    "legal-unavailable-message": "Contractual terms are temporarily unavailable. Payment cannot start.",
    "seller-not-ready-message":
        "This offer is not currently available for purchase. The seller must complete payment activation.",
    "insufficient-funds-message": "The card has insufficient funds. Try another payment method.",
    "card-declined-message": "The card was declined. Try another payment method.",
    "card-expired-message": "The card expired. Use another card.",
    "authentication-error-message": "Payment authentication failed. Try again or use another card.",
    "error-message": "Payment could not be processed. Try again or use another payment method.",
};

export function paymentText(
    host: HTMLElement,
    name: keyof typeof paymentCopy,
    parameters: Record<string, unknown> = {},
): string {
    const value = host.getAttribute(name)?.trim() || paymentCopy[name];
    return value.replace(/\{([a-z]+)\}/gu, (token, key: string) => String(parameters[key] ?? token));
}
