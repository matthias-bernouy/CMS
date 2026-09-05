import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

import { fulfillmentCopy } from "./helpers";

export class CommerceMondialRelaySaleFulfillmentEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Shipment copy",
                settings: Object.entries(fulfillmentCopy).map(([attribute, defaultValue]) => ({
                    type: "text" as const,
                    attribute,
                    label: attribute.replaceAll("-", " "),
                    defaultValue,
                })),
            },
            {
                kind: "self",
                label: "Sale",
                settings: [
                    { type: "text", label: "Order identifier", attribute: "order-id" },
                    { type: "text", label: "Query parameter", attribute: "order-param", defaultValue: "orderId" },
                ],
            },
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title" },
                    { type: "textarea", label: "Description", attribute: "copy" },
                    { type: "text", label: "Create label", attribute: "create-label" },
                    { type: "text", label: "Retry", attribute: "retry-label" },
                    { type: "text", label: "Download label", attribute: "label-label" },
                    { type: "text", label: "Redownload label", attribute: "redownload-label" },
                    { type: "text", label: "Declare carrier handoff", attribute: "handoff-label" },
                    { type: "text", label: "Track parcel", attribute: "tracking-label" },
                    {
                        type: "text",
                        label: "Error title",
                        attribute: "error-title",
                        defaultValue: "Shipment unavailable",
                    },
                    { type: "text", label: "Error message override", attribute: "error-message" },
                    {
                        type: "text",
                        label: "Missing sale message",
                        attribute: "missing-order-message",
                        defaultValue: "The sale identifier is missing.",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Tracking action",
                slot: "tracking-action",
                accepts: [{ kind: "any-component" }],
                min: 1,
                max: 1,
            },
        ];
    }
}

registerEditor({ editor: CommerceMondialRelaySaleFulfillmentEditor });
