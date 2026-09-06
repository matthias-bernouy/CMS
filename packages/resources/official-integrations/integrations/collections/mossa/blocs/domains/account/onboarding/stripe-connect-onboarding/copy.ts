export const walletMessages = {
    "preview-message": "Payout activation is available on the published page.",
    "loading-label": "Loading seller account",
    "terms-unavailable-title": "Seller terms unavailable",
    "payment-consent-prefix": "I accept the ",
    "payment-consent-suffix": ".",
    "requirements-due-message": "More information is required. Check your profile first.",
    "rejected-message": "Your payout account could not be verified.",
    "checking-profile-message": "Checking your profile…",
    "missing-profile-message": "Complete the following information: {fields}.",
    "activate-profile-message": "Complete your profile before activating payouts.",
    "sending-message": "Sending your information securely…",
    "terms-changed-message": "Seller terms changed. Review the new version before continuing.",
    "saving-acceptance-message": "Saving your acceptance…",
    "verification-pending-message":
        "Verification pending. Your information is being reviewed and this may take a few minutes.",
    "verification-error-message": "This information could not be verified.",
    "iban-error-message": "This IBAN could not be verified.",
    "birth-date-error-message": "The profile birth date must use the YYYY-MM-DD format.",
    "payment-unavailable-message": "The secure payment service is unavailable.",
    "payment-load-error-message": "The secure payment service could not be loaded.",
    "error-message": "Something went wrong. Try again shortly.",
    "profile-given-name-label": "first name",
    "profile-surname-label": "last name",
    "profile-birth-date-label": "birth date",
    "profile-phone-label": "phone number",
    "profile-address-label": "address",
    "profile-postal-code-label": "postal code",
    "profile-city-label": "city",
    "profile-country-label": "country",
};

export function walletCopy(host, name) {
    return host.getAttribute(name) ?? walletMessages[name];
}

export function translateWalletMessage(host, message) {
    const entry = Object.entries(walletMessages).find(([, fallback]) => fallback === message);
    return entry ? walletCopy(host, entry[0]) : message;
}
