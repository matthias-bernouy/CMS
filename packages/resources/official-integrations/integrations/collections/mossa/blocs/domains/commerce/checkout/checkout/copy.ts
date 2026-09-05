type CopyEntry = readonly [attribute: string, fallback: string, selector?: string, targetAttribute?: string];

export const checkoutCopy: readonly CopyEntry[] = [
    ["loading-label", "Loading payment", "[data-loading] mossa-skeleton", "label"],
    ["steps-label", "Payment steps", ".steps", "aria-label"],
    ["information-title", "Your information", '[data-panel="information"] > [slot="title"]'],
    [
        "information-description",
        "Check the information used for delivery.",
        '[data-panel="information"] > [slot="description"]',
    ],
    ["first-name-label", "First name", '[name="givenName"]', "label"],
    ["last-name-label", "Name", '[name="surname"]', "label"],
    ["email-label", "E-mail", '[name="email"]', "label"],
    ["phone-label", "Phone", '[name="phone"]', "label"],
    ["phone-hint", "Required for delivery notifications", '[name="phone"]', "hint"],
    ["address-label", "Address", '[name="addressLine1"]', "label"],
    ["address-line-2-label", "Address line 2", '[name="addressLine2"]', "label"],
    ["postal-code-label", "Postal code", '[name="postalCode"]', "label"],
    ["city-label", "City", '[name="city"]', "label"],
    ["continue-delivery-label", "Continue to delivery", "[data-save-information] > button"],
    ["delivery-title", "Choose your pickup point", '[data-panel="delivery"] > [slot="title"]'],
    [
        "delivery-description",
        "Delivery is provided exclusively by the configured carrier.",
        '[data-panel="delivery"] > [slot="description"]',
    ],
    ["relay-title", "Mondial Relay pickup point", "[data-relay-picker]", "title"],
    ["relay-search-label", "Search", "[data-relay-picker]", "button-label"],
    ["relay-selection-label", "Select", "[data-relay-picker]", "selection-label"],
    ["relay-change-label", "Change", "[data-relay-picker]", "change-label"],
    ["relay-postal-code-label", "Postal code", "[data-relay-picker]", "postal-code-label"],
    ["relay-city-label", "City", "[data-relay-picker]", "city-label"],
    [
        "relay-postal-code-required-message",
        "Postal code is required.",
        "[data-relay-picker]",
        "postal-code-required-message",
    ],
    [
        "relay-country-required-message",
        "Configure a country code before searching pickup points.",
        "[data-relay-picker]",
        "country-required-message",
    ],
    ["relay-searching-message", "Searching pickup points…", "[data-relay-picker]", "searching-message"],
    ["relay-results-one-message", "{count} pickup point available.", "[data-relay-picker]", "results-one-message"],
    ["relay-results-many-message", "{count} pickup points available.", "[data-relay-picker]", "results-many-message"],
    ["relay-empty-message", "No pickup point found.", "[data-relay-picker]", "empty-message"],
    ["relay-saving-message", "Saving pickup point…", "[data-relay-picker]", "saving-message"],
    ["relay-selected-message", "Pickup point selected.", "[data-relay-picker]", "selected-message"],
    ["relay-restored-message", "Pickup point saved for this order.", "[data-relay-picker]", "restored-message"],
    ["relay-change-message", "Search for another pickup point.", "[data-relay-picker]", "change-message"],
    ["relay-login-message", "Sign in to choose a pickup point.", "[data-relay-picker]", "login-message"],
    [
        "relay-forbidden-message",
        "You are not allowed to change this pickup point.",
        "[data-relay-picker]",
        "forbidden-message",
    ],
    [
        "relay-error-message",
        "Pickup points cannot be searched right now. Try again shortly.",
        "[data-relay-picker]",
        "error-message",
    ],
    ["back-label", "Back", "[data-back-information] > button"],
    ["continue-payment-label", "Continue to payment", "[data-create-order] > button"],
    ["payment-title", "Payment", '[data-panel="payment"] > [slot="title"]'],
    ["payment-description", "Pay for your order with secure payment.", '[data-panel="payment"] > [slot="description"]'],
    ["summary-title", "Your order", 'aside [slot="title"]'],
    ["item-label", "Item", "[data-item-label]"],
    ["shipping-label", "Delivery", "[data-shipping-label]"],
    ["protection-label", "Buyer protection", "[data-protection-label]"],
    ["total-label", "Total", "[data-total-label]"],
    ["security-note", "Prices and fees verified by the server", "[data-security-note]"],
    ["pending-amount-label", "To calculate"],
    ["fallback-offer-label", "Offer"],
    ["fallback-item-label", "Item"],
    ["quantity-label", "Quantity: {count}"],
    ["seller-label", "Sold by {seller}"],
    ["resume-delivery-message", "Select the pickup point again to resume this order."],
    ["information-error-message", "Your information could not be saved. Try again shortly."],
    ["order-error-message", "The order could not be prepared. Try again shortly."],
    ["processing-message", "Payment is being processed. You can view your order."],
    ["missing-information-message", "Enter the following information: {fields}."],
    ["invalid-information-message", "Check the information in the form."],
    ["saving-message", "Saving…"],
    ["missing-relay-message", "Choose a pickup point before continuing."],
    ["creating-order-message", "Creating the order and checking delivery…"],
    ["paid-message", "Payment confirmed. The seller can now prepare the shipment."],
    ["select-option-message", "Select an option from the list."],
    ["search-options-placeholder", "Search options…"],
    ["empty-options-message", "No option found."],
    ["select-option-placeholder", "Select an option"],
    ["no-selection-label", "No selection"],
    ["yes-label", "Yes"],
    ["no-label", "No"],
    ["required-message", "This field is required."],
    ["invalid-email-message", "Enter a valid email address."],
    ["invalid-url-message", "Enter a valid web address."],
    ["too-short-message", "Enter at least {minimum} characters."],
    ["too-long-message", "Enter at most {maximum} characters."],
    ["minimum-value-message", "Enter a value greater than or equal to {minimum}."],
    ["maximum-value-message", "Enter a value less than or equal to {maximum}."],
    ["invalid-format-message", "Use the requested format."],
    ["invalid-value-message", "Enter a valid value."],
    ["check-value-message", "Check the entered value."],
    [
        "seller-not-ready-message",
        "This offer is not currently available for purchase. The seller must complete payment activation.",
    ],
    ["agreement-expired-message", "This accepted proposal expired and can no longer be paid."],
    ["agreement-canceled-message", "This accepted proposal was cancelled."],
    ["agreement-consumed-message", "This accepted proposal was already used for an order."],
    ["agreement-unavailable-message", "This accepted proposal is no longer available for payment."],
];

export function checkoutText(host: HTMLElement, attribute: string, parameters: Record<string, unknown> = {}): string {
    const fallback = checkoutCopy.find(([name]) => name === attribute)?.[1] || "";
    const value = host.getAttribute(attribute)?.trim() || fallback;
    return value.replace(/\{([a-z]+)\}/gu, (token, name: string) => String(parameters[name] ?? token));
}

export function syncCheckoutCopy(host: HTMLElement): void {
    for (const [attribute, , selector, targetAttribute] of checkoutCopy) {
        const target = selector ? host.shadowRoot?.querySelector(selector) : null;
        if (!target) {
            continue;
        }
        const value = checkoutText(host, attribute);
        if (targetAttribute) {
            target.setAttribute(targetAttribute, value);
        } else {
            target.textContent = value;
        }
    }
}
