import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class CheckoutFlowEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
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
