import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

import { checkoutCopy } from "./copy";

export class CheckoutFlowEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Checkout copy",
                settings: checkoutCopy.map(([attribute, defaultValue]) => ({
                    type: "text" as const,
                    label: attribute.replaceAll("-", " "),
                    attribute,
                    defaultValue,
                })),
            },
            {
                kind: "self",
                label: "State copy",
                settings: [
                    {
                        type: "text",
                        label: "Sign-in title",
                        attribute: "login-title",
                        defaultValue: "Sign in to continue",
                    },
                    {
                        type: "text",
                        label: "Sign-in description",
                        attribute: "login-description",
                        defaultValue: "An account is required to secure the order and track delivery.",
                    },
                    {
                        type: "text",
                        label: "Error title",
                        attribute: "error-title",
                        defaultValue: "Unable to continue",
                    },
                    {
                        type: "text",
                        label: "Error message",
                        attribute: "error-message",
                        defaultValue: "The checkout flow could not be loaded. Try again shortly.",
                    },
                    {
                        type: "text",
                        label: "Missing offer",
                        attribute: "missing-offer-message",
                        defaultValue: "The offer to purchase is missing.",
                    },
                    {
                        type: "text",
                        label: "Missing accepted proposal",
                        attribute: "missing-agreement-message",
                        defaultValue: "The accepted proposal to pay is missing.",
                    },
                ],
            },
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    { type: "text", label: "Sign-in URL pattern", attribute: "login-url" },
                    { type: "text", label: "Order URL pattern", attribute: "order-url" },
                ],
            },
            {
                kind: "self",
                label: "Regional settings",
                settings: [
                    {
                        type: "text",
                        label: "Authenticated account email",
                        attribute: "account-email",
                        help: "Bind the authenticated email when the account profile does not expose it.",
                    },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "en-US" },
                    { type: "text", label: "Country code", attribute: "country-code" },
                ],
            },
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title", defaultValue: "Complete order" },
                    {
                        type: "text",
                        label: "Information step",
                        attribute: "information-label",
                        defaultValue: "Information",
                    },
                    { type: "text", label: "Delivery step", attribute: "delivery-label", defaultValue: "Delivery" },
                    { type: "text", label: "Payment step", attribute: "payment-label", defaultValue: "Payment" },
                ],
            },
        ];
    }
}

registerEditor({ editor: CheckoutFlowEditor });
