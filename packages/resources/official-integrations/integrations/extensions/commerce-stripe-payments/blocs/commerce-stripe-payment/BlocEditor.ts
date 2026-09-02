import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});

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
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Accent", "accent-color"),
                    color("Background", "background-color"),
                    color("Border", "border-color"),
                    color("Text", "text-color"),
                ],
            },
        ];
    }
}

registerEditor({ editor: CommerceStripePaymentEditor });
