import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class OrderDetailEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    {
                        type: "text",
                        label: "Resume checkout URL pattern",
                        attribute: "checkout-url",
                    },
                ],
            },
            {
                kind: "self",
                label: "Delivery",
                settings: [
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "en-US" },
                    {
                        type: "text",
                        label: "Usual delivery time",
                        attribute: "delivery-estimate-label",
                        defaultValue: "Typical delivery time: 3 to 5 business days after shipment.",
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: OrderDetailEditor });
