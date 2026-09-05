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
