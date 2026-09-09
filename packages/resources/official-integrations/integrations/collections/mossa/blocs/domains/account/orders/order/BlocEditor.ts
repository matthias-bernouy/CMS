import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

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
                    {
                        type: "select",
                        label: "Progress tone",
                        attribute: "progress-tone",
                        defaultValue: "primary",
                        options: [
                            { label: "Primary", value: "primary" },
                            { label: "Secondary", value: "secondary" },
                            { label: "Success", value: "success" },
                            { label: "Warning", value: "warning" },
                            { label: "Danger", value: "danger" },
                            { label: "Info", value: "info" },
                        ],
                    },
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

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Navigation", slot: "navigation", max: 1, accepts: [{ kind: "any-component" }] },
            { label: "Error action", slot: "error-action", max: 1, accepts: [{ kind: "any-component" }] },
        ];
    }
}

registerEditor({ editor: OrderDetailEditor });
