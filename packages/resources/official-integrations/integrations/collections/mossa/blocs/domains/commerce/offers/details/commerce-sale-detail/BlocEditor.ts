import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class CommerceSaleDetailEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Eyebrow", attribute: "eyebrow", defaultValue: "SALE" },
                    { type: "text", label: "Date prefix", attribute: "date-prefix", defaultValue: "Sold on" },
                    {
                        type: "text",
                        label: "Items title",
                        attribute: "articles-title",
                        defaultValue: "Sold items",
                    },
                    { type: "text", label: "Summary title", attribute: "summary-title", defaultValue: "Summary" },
                    {
                        type: "text",
                        label: "Sale price label",
                        attribute: "subtotal-label",
                        defaultValue: "Sale price",
                    },
                    {
                        type: "text",
                        label: "Commission label",
                        attribute: "commission-label",
                        defaultValue: "Platform commission",
                    },
                    { type: "text", label: "Shipping label", attribute: "shipping-label", defaultValue: "Delivery" },
                    {
                        type: "text",
                        label: "Platform shipping label",
                        attribute: "platform-shipping-label",
                        defaultValue: "Covered by the platform",
                    },
                    {
                        type: "text",
                        label: "Net proceeds label",
                        attribute: "total-label",
                        defaultValue: "Net amount to receive",
                    },
                    { type: "text", label: "Quantity label", attribute: "quantity-label", defaultValue: "Quantity" },
                    {
                        type: "text",
                        label: "Fallback article label",
                        attribute: "fallback-article-label",
                        defaultValue: "Item",
                    },
                    { type: "text", label: "Back label", attribute: "back-label", defaultValue: "Back to sales" },
                    { type: "text", label: "Error title", attribute: "error-title", defaultValue: "Sale not found" },
                    {
                        type: "textarea",
                        label: "Error message",
                        attribute: "error-message",
                        defaultValue: "This sale could not be loaded.",
                    },
                ],
            },
            {
                kind: "self",
                label: "Status labels",
                settings: [
                    {
                        type: "text",
                        label: "Awaiting quote",
                        attribute: "label-awaiting_quote",
                        defaultValue: "Delivery to complete",
                    },
                    {
                        type: "text",
                        label: "Awaiting payment",
                        attribute: "label-awaiting_payment",
                        defaultValue: "Payment pending",
                    },
                    { type: "text", label: "Active", attribute: "label-active", defaultValue: "To ship" },
                    {
                        type: "text",
                        label: "Seller handoff declared",
                        attribute: "label-seller_handoff_declared",
                        defaultValue: "Handoff declared",
                    },
                    {
                        type: "text",
                        label: "Carrier accepted",
                        attribute: "label-carrier_accepted",
                        defaultValue: "Pris en charge",
                    },
                    { type: "text", label: "In transit", attribute: "label-in_transit", defaultValue: "In transit" },
                    {
                        type: "text",
                        label: "Available for pickup",
                        attribute: "label-available_for_pickup",
                        defaultValue: "Available at pickup point",
                    },
                    {
                        type: "text",
                        label: "Delivered",
                        attribute: "label-collected_by_recipient",
                        defaultValue: "Delivered",
                    },
                    { type: "text", label: "Completed", attribute: "label-completed", defaultValue: "Completed" },
                    {
                        type: "text",
                        label: "Cancellation pending",
                        attribute: "label-cancellation_pending",
                        defaultValue: "Cancellation in progress",
                    },
                    { type: "text", label: "Cancelled", attribute: "label-cancelled", defaultValue: "Cancelled" },
                    { type: "text", label: "Expired", attribute: "label-expired", defaultValue: "Expired" },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Card appearance",
                        attribute: "card-appearance",
                        defaultValue: "outlined",
                        options: ["plain", "outlined", "elevated"].map((value) => ({ label: value, value })),
                    },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    {
                        type: "text",
                        label: "Page identifier parameter",
                        attribute: "order-param",
                        defaultValue: "orderId",
                    },
                    { type: "text", label: "Fixed sale identifier", attribute: "sale-id" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "en-US" },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Back action", slot: "error-action", max: 1, accepts: [{ kind: "any-component" }] },
            { label: "Fulfillment", slot: "fulfillment", max: 1, accepts: [{ kind: "any-component" }] },
        ];
    }
}

registerEditor({ editor: CommerceSaleDetailEditor });
