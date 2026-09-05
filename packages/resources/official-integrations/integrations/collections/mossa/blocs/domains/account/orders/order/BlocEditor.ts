import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

import { orderCopy } from "./copy";

export class OrderDetailEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Order copy",
                settings: Object.entries(orderCopy).map(([attribute, defaultValue]) => ({
                    type: "text" as const,
                    attribute,
                    label: attribute.replaceAll("-", " "),
                    defaultValue,
                })),
            },
            {
                kind: "self",
                label: "State copy",
                settings: [
                    { type: "text", label: "Error title", attribute: "error-title", defaultValue: "Order not found" },
                    {
                        type: "text",
                        label: "Error message",
                        attribute: "error-message",
                        defaultValue: "The order could not be loaded. Try again shortly.",
                    },
                    {
                        type: "text",
                        label: "Missing order",
                        attribute: "missing-order-message",
                        defaultValue: "The order identifier is missing.",
                    },
                ],
            },
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
