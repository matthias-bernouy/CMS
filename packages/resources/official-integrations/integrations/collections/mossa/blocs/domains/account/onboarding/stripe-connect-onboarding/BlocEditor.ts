import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { walletMessages } from "./copy";

export class StripeConnectOnboardingEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Status and validation messages",
                settings: Object.entries(walletMessages).map(([attribute, defaultValue]) => ({
                    type: "text" as const,
                    label: attribute.replaceAll("-", " "),
                    attribute,
                    defaultValue,
                })),
            },
            {
                kind: "self",
                label: "Regional settings",
                settings: [
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "en-US" },
                    { type: "text", label: "Payout currency", attribute: "payout-currency", defaultValue: "USD" },
                ],
            },
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title" },
                    { type: "text", label: "Eyebrow", attribute: "eyebrow" },
                    { type: "textarea", label: "Description", attribute: "copy" },
                    { type: "text", label: "Activation title", attribute: "activation-title" },
                    { type: "textarea", label: "Activation text", attribute: "activation-copy" },
                    { type: "text", label: "Activation button", attribute: "button-label" },
                    { type: "text", label: "Incomplete profile title", attribute: "missing-title" },
                    { type: "text", label: "Complete profile link", attribute: "profile-link-label" },
                ],
            },
            {
                kind: "self",
                label: "Bank activation",
                settings: [
                    { type: "textarea", label: "Introduction", attribute: "ready-copy" },
                    { type: "text", label: "Email label", attribute: "email-label" },
                    { type: "text", label: "IBAN label", attribute: "iban-label" },
                    { type: "textarea", label: "IBAN privacy notice", attribute: "privacy-copy" },
                    { type: "textarea", label: "Security message", attribute: "security-copy" },
                    { type: "text", label: "Marketplace terms label", attribute: "marketplace-terms-label" },
                    { type: "textarea", label: "Marketplace consent text", attribute: "marketplace-consent-text" },
                    { type: "text", label: "Payment terms label", attribute: "payment-terms-label" },
                ],
            },
            {
                kind: "self",
                label: "Terms update",
                settings: [
                    { type: "text", label: "Title", attribute: "terms-update-title" },
                    { type: "textarea", label: "Description", attribute: "terms-update-copy" },
                    { type: "text", label: "Button", attribute: "terms-update-button-label" },
                    { type: "textarea", label: "Unavailable message", attribute: "terms-unavailable-copy" },
                ],
            },
            {
                kind: "self",
                label: "Active wallet",
                settings: [
                    { type: "text", label: "Available balance", attribute: "available-label" },
                    { type: "text", label: "Pending balance", attribute: "pending-label" },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            anchorSlot("Profile link", "profile-link"),
            anchorSlot("Marketplace terms for activation", "marketplace-activation-terms"),
            anchorSlot("Payment service terms", "payment-terms"),
            anchorSlot("Marketplace terms update", "marketplace-update-terms"),
        ];
    }
}

function anchorSlot(label: string, slot: string): ContentSlot {
    return { label, slot, accepts: [{ kind: "component", tag: "a" }], min: 1, max: 1 };
}

registerEditor({ editor: StripeConnectOnboardingEditor });
