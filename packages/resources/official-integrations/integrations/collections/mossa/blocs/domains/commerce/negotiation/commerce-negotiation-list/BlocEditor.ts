import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
const visible = (label: string, attribute: string) => ({
    type: "segmented" as const,
    label,
    attribute,
    defaultValue: "true",
    options: [
        { label: "Visible", value: "true" },
        { label: "Hidden", value: "false" },
    ],
});

export class CommerceNegotiationListEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title", defaultValue: "My proposals" },
                    { type: "textarea", label: "Description", attribute: "copy" },
                    { type: "text", label: "Combined tab", attribute: "combined-label", defaultValue: "All" },
                    {
                        type: "text",
                        label: "Received tab",
                        attribute: "received-label",
                        defaultValue: "Received proposals",
                    },
                    { type: "text", label: "Sent tab", attribute: "sent-label", defaultValue: "Sent proposals" },
                    {
                        type: "text",
                        label: "Received direction",
                        attribute: "received-direction-label",
                        defaultValue: "Received proposal",
                    },
                    {
                        type: "text",
                        label: "Sent direction",
                        attribute: "sent-direction-label",
                        defaultValue: "Sent proposal",
                    },
                    {
                        type: "text",
                        label: "Status accessible label",
                        attribute: "status-label",
                        defaultValue: "Filter by status",
                    },
                    {
                        type: "text",
                        label: "Role accessible label",
                        attribute: "role-label",
                        defaultValue: "Proposal type",
                    },
                    { type: "text", label: "Loading", attribute: "loading-label", defaultValue: "Loading proposals" },
                    {
                        type: "text",
                        label: "Unavailable title",
                        attribute: "error-title",
                        defaultValue: "Proposals unavailable",
                    },
                    {
                        type: "text",
                        label: "Unavailable image",
                        attribute: "image-unavailable-label",
                        defaultValue: "No photo available",
                    },
                    {
                        type: "text",
                        label: "Offer link",
                        attribute: "offer-link-template",
                        defaultValue: "View {title}",
                    },
                    {
                        type: "text",
                        label: "Proposed price",
                        attribute: "proposed-label",
                        defaultValue: "Proposed price",
                    },
                    {
                        type: "text",
                        label: "Reference price",
                        attribute: "reference-label",
                        defaultValue: "Initial price",
                    },
                    {
                        type: "text",
                        label: "Expiration",
                        attribute: "expiration-label",
                        defaultValue: "Expires on {date}",
                    },
                    { type: "text", label: "Accept", attribute: "accept-label", defaultValue: "Accept" },
                    { type: "text", label: "Reject", attribute: "reject-label", defaultValue: "Reject" },
                    { type: "text", label: "Withdraw", attribute: "withdraw-label", defaultValue: "Withdraw" },
                    {
                        type: "text",
                        label: "Buyer checkout action",
                        attribute: "checkout-label-template",
                        defaultValue: "Complete purchase — {amount}",
                    },
                    {
                        type: "text",
                        label: "Order action",
                        attribute: "order-label",
                        defaultValue: "View my order",
                    },
                    {
                        type: "text",
                        label: "Decision date",
                        attribute: "decision-label-template",
                        defaultValue: "{status} on {date}",
                    },
                    {
                        type: "text",
                        label: "Checkout expiration",
                        attribute: "checkout-expiration-label",
                        defaultValue: "Payment available until {date}",
                    },
                    { type: "textarea", label: "Accept confirmation", attribute: "confirm-accept-message" },
                    { type: "textarea", label: "Reject confirmation", attribute: "confirm-reject-message" },
                    { type: "textarea", label: "Withdraw confirmation", attribute: "confirm-withdraw-message" },
                    { type: "text", label: "Empty title", attribute: "empty-title" },
                    { type: "textarea", label: "Empty message", attribute: "empty-message" },
                    {
                        type: "text",
                        label: "Filtered empty title",
                        attribute: "empty-filtered-title",
                        defaultValue: "No proposal with this status",
                    },
                    {
                        type: "textarea",
                        label: "Filtered empty message",
                        attribute: "empty-filtered-message",
                        defaultValue: "Try another status to find your proposals.",
                    },
                    { type: "textarea", label: "Error message", attribute: "error-message" },
                    { type: "textarea", label: "Accepted message", attribute: "success-accept-message" },
                    { type: "textarea", label: "Rejected message", attribute: "success-reject-message" },
                    { type: "textarea", label: "Withdrawn message", attribute: "success-withdraw-message" },
                ],
            },
            {
                kind: "self",
                label: "Status labels",
                settings: [
                    ...Object.entries(defaultStatusLabels).map(([value, label]) => ({
                        type: "text" as const,
                        label: `Card · ${label}`,
                        attribute: `label-${value}`,
                        defaultValue: label,
                    })),
                    ...Object.entries(defaultFilterLabels).map(([value, label]) => ({
                        type: "text" as const,
                        label: `Filter · ${label}`,
                        attribute: `filter-label-${value}`,
                        defaultValue: label,
                    })),
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Minimum card width",
                        attribute: "grid-min",
                        defaultValue: "md",
                        options: ["xs", "sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Maximum card width",
                        attribute: "grid-max",
                        defaultValue: "xl",
                        options: ["none", "sm", "md", "lg", "xl", "2xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Grid packing",
                        attribute: "grid-packing",
                        defaultValue: "fit",
                        options: [
                            { label: "Fit available columns", value: "fit" },
                            { label: "Keep empty columns", value: "fill" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Grid gap",
                        attribute: "grid-gap",
                        defaultValue: "md",
                        options: ["none", "xs", "sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Card appearance",
                        attribute: "card-appearance",
                        defaultValue: "outlined",
                        options: ["plain", "outlined", "elevated"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Card density",
                        attribute: "card-density",
                        defaultValue: "compact",
                        options: ["compact", "regular", "spacious"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "segmented",
                        label: "Card layout",
                        attribute: "card-layout",
                        defaultValue: "vertical",
                        options: [
                            { label: "Vertical", value: "vertical" },
                            { label: "Horizontal", value: "horizontal" },
                        ],
                    },
                    visible("Header", "show-header"),
                    visible("Received/sent tabs", "show-role-tabs"),
                    visible("Reference price", "show-reference-price"),
                    visible("Buyer message", "show-message"),
                    visible("Expiration", "show-expiration"),
                ],
            },
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    { type: "text", label: "Offer URL", attribute: "offer-url" },
                    { type: "text", label: "Checkout URL", attribute: "checkout-url" },
                    { type: "text", label: "Order URL", attribute: "order-url" },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Offer link", slot: "offer-navigation", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Checkout action", slot: "checkout-action", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Order action", slot: "order-action", accepts: [{ kind: "any-component" }], max: 1 },
        ];
    }
}

registerEditor({ editor: CommerceNegotiationListEditor });

const defaultStatusLabels = {
    all: "All",
    pending: "Pending",
    accepted: "Accepted",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
    expired: "Expired",
    superseded: "Superseded",
    canceled: "Cancelled",
};

const defaultFilterLabels = {
    all: "All",
    pending: "Pending",
    accepted: "Accepted",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
    expired: "Expired",
    superseded: "Superseded",
    canceled: "Cancelled",
};
