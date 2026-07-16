import {
    Editor,
    registerEditor,
    type ColorSetting,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});

export class StripeConnectOnboardingEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Sources",
                settings: [
                    { type: "text", label: "Source Stripe Connect", attribute: "source-id" },
                    { type: "text", label: "User Account source", attribute: "account-source-id" },
                    { type: "text", label: "Authentication source", attribute: "auth-source-id" },
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
                    { type: "page-link", label: "Profile page", attribute: "profile-url" },
                ],
            },
            {
                kind: "self",
                label: "Bank activation",
                settings: [
                    { type: "textarea", label: "Introduction", attribute: "ready-copy" },
                    { type: "text", label: "IBAN label", attribute: "iban-label" },
                    { type: "textarea", label: "IBAN privacy notice", attribute: "privacy-copy" },
                    { type: "textarea", label: "Security message", attribute: "security-copy" },
                    { type: "text", label: "Marketplace terms label", attribute: "marketplace-terms-label" },
                    { type: "text", label: "Payment terms label", attribute: "payment-terms-label" },
                    { type: "page-link", label: "Marketplace terms", attribute: "terms-url" },
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
            {
                kind: "self",
                label: "Colours",
                settings: [
                    color("Wallet colour", "accent-color"),
                    color("Wallet text colour", "accent-text-color"),
                ],
            },
        ];
    }
}

registerEditor({ editor: StripeConnectOnboardingEditor });
