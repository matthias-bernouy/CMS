export const accountFieldLabels = {
    "given-name": "First name",
    surname: "Name",
    "birth-date": "Birth date",
    phone: "Phone",
    "address-line-1": "Address",
    "address-line-2": "Address line 2",
    "address-line-3": "Address line 3",
    "postal-code": "Postal code",
    city: "City",
    region: "Region / state",
    "country-code": "Country code",
    locale: "Language",
    timezone: "Time zone",
    avatar: "Profile picture",
};

export const accountMessages = {
    "avatar-uploading-label": "Uploading image…",
    "avatar-error-message": "The profile picture could not be updated.",
    "load-error-message": "Your personal information could not be loaded.",
    "success-message": "Information saved.",
    "save-error-message": "Your information could not be saved.",
};

export const accountFields = Object.keys(accountFieldLabels);
export const accountCopyAttributes = [
    ...accountFields.map((field) => `${field}-label`),
    ...Object.keys(accountMessages),
    "loading-label",
    "avatar-hint",
];

export function syncAccountCopy(host: HTMLElement): void {
    setAttribute(
        host.querySelector("[data-avatar-input]"),
        "hint",
        host.getAttribute("avatar-hint")?.trim() || "JPEG, PNG, WebP, or GIF, up to 5 MiB.",
    );
    for (const [field, fallback] of Object.entries(accountFieldLabels)) {
        const input = host.querySelector(
            field === "avatar" ? "[data-avatar-input]" : `[data-account-field="${field}"]`,
        );
        setAttribute(
            input,
            field === "avatar" ? "aria-label" : "label",
            host.getAttribute(`${field}-label`)?.trim() || fallback,
        );
    }
    for (const [attribute, fallback] of Object.entries(accountMessages)) {
        const element = host.querySelector(`[data-account-copy="${attribute}"]`);
        const value = host.getAttribute(attribute)?.trim() || fallback;
        if (element && element.textContent !== value) {
            element.textContent = value;
        }
    }
    setAttribute(
        host.querySelector("[data-account-loading]"),
        "label",
        host.getAttribute("loading-label")?.trim() || "Loading your information",
    );
}

function setAttribute(element: Element | null, attribute: string, value: string): void {
    if (element && element.getAttribute(attribute) !== value) {
        element.setAttribute(attribute, value);
    }
}
