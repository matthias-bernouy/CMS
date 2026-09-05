import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class CommerceStripePaymentEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Payment bindings",
                settings: [{ type: "text", label: "Commerce order id", attribute: "order-id", required: true }],
            },
            {
                kind: "self",
                label: "Content",
                settings: [
                    {
                        type: "segmented",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "card",
                        options: [
                            { label: "Card", value: "card" },
                            { label: "Embedded", value: "embedded" },
                        ],
                    },
                    { type: "text", label: "Title", attribute: "title" },
                    { type: "textarea", label: "Description", attribute: "copy" },
                    { type: "text", label: "Summary label", attribute: "summary-label" },
                    { type: "text", label: "Button label", attribute: "button-label" },
                    { type: "text", label: "Success message", attribute: "success-label" },
                    { type: "page-link", label: "Return page", attribute: "return-url" },
                    {
                        type: "segmented",
                        label: "Legal agreements",
                        attribute: "legal-appearance",
                        defaultValue: "detailed",
                        options: [
                            { label: "Detailed", value: "detailed" },
                            { label: "Compact", value: "compact" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Payment methods layout",
                        attribute: "layout",
                        defaultValue: "tabs",
                        options: [
                            { label: "Tabs", value: "tabs" },
                            { label: "Accordion", value: "accordion" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Link wallet",
                        attribute: "link-wallet",
                        defaultValue: "never",
                        options: [
                            { label: "Disabled", value: "never" },
                            { label: "Enabled", value: "auto" },
                        ],
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: CommerceStripePaymentEditor });
