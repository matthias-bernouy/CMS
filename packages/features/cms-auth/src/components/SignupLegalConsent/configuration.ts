import type { SignupLegalConsentAppearance, SignupLegalConsentCopy } from "./view";

export const SIGNUP_LEGAL_CONSENT_ATTRIBUTES = [
    "appearance",
    "disabled",
    "heading",
    "load-error-label",
    "loading-label",
    "new-tab-label",
    "required-message",
    "retry-label",
    "source-id",
    "source-prefix",
];

export type SignupLegalConsentResolvedCopy = SignupLegalConsentCopy & {
    requiredMessage: string;
};

export function signupLegalConsentAppearance(element: HTMLElement): SignupLegalConsentAppearance {
    return element.getAttribute("appearance") === "compact" ? "compact" : "detailed";
}

export function signupLegalConsentCopy(element: HTMLElement): SignupLegalConsentResolvedCopy {
    return {
        heading: attribute(element, "heading", "Agreements"),
        loadingLabel: attribute(element, "loading-label", "Loading agreements…"),
        loadErrorLabel: attribute(element, "load-error-label", "Unable to load the agreements."),
        retryLabel: attribute(element, "retry-label", "Try again"),
        requiredMessage: attribute(element, "required-message", "Accept every agreement to continue."),
        newTabLabel: attribute(element, "new-tab-label", "opens in a new tab"),
    };
}

export function signupLegalRequirementsUrl(element: HTMLElement): string {
    const prefix = (element.getAttribute("source-prefix")?.trim() || "/.cms/sources").replace(/\/+$/, "");
    if (!prefix.startsWith("/") || prefix.startsWith("//")) {
        throw new Error("Signup legal source prefix must be a same-origin path.");
    }
    const sourceId = element.getAttribute("source-id")?.trim() || "system-auth";
    const url = new URL(`${prefix}/${encodeURIComponent(sourceId)}/signupLegalRequirements`, location.origin);
    if (url.origin !== location.origin || url.search || url.hash) {
        throw new Error("Signup legal source prefix must be a same-origin path.");
    }
    return url.pathname;
}

function attribute(element: HTMLElement, name: string, fallback: string): string {
    return element.getAttribute(name)?.trim() || fallback;
}
