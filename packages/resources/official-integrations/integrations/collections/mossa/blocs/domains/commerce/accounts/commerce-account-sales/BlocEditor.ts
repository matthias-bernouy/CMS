import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

const statusLabels = {
    awaiting_quote: "Delivery to complete",
    awaiting_payment: "Payment pending",
    active: "To ship",
    completed: "Completed",
    cancellation_pending: "Cancellation in progress",
    cancelled: "Cancelled",
    expired: "Expired",
};

export class CommerceAccountSalesEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    text("Status filter", "status-label", "Filter sales by status"),
                    text("All statuses", "label-all", "All"),
                    text("Loading", "loading-label", "Loading sales"),
                    text("Empty title", "empty-title", "No sales yet"),
                    text("Empty message", "empty-message", "Buyer orders will appear here."),
                    text("Error message", "error-message", "Sales could not be loaded. Try again shortly."),
                    text("Sold on", "sold-on-label", "Sold on"),
                    text("Sale amount", "sale-amount-label", "Sale amount"),
                    text("Multiple items", "items-label", "items"),
                    ...Object.entries(statusLabels).map(([status, label]) => text(label, `label-${status}`, label)),
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    select("Minimum card width", "grid-min", "xl", ["xs", "sm", "md", "lg", "xl"]),
                    select("Maximum card width", "grid-max", "xl", ["none", "sm", "md", "lg", "xl", "2xl"]),
                    select("Grid gap", "grid-gap", "sm", ["none", "xs", "sm", "md", "lg", "xl"]),
                    {
                        type: "segmented",
                        label: "Column packing",
                        attribute: "grid-packing",
                        defaultValue: "fit",
                        options: [
                            { label: "Fill", value: "fill" },
                            { label: "Fit content", value: "fit" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Order reference",
                        attribute: "show-order-reference",
                        defaultValue: "false",
                        options: [
                            { label: "Visible", value: "true" },
                            { label: "Hidden", value: "false" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Status filter",
                        attribute: "show-status-filter",
                        defaultValue: "true",
                        options: [
                            { label: "Visible", value: "true" },
                            { label: "Hidden", value: "false" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    text("Sale URL pattern", "sale-url", ""),
                    text("Sale action", "sale-action-label", "View sale"),
                ],
            },
            {
                kind: "self",
                label: "Pagination",
                settings: [
                    text("Previous", "pagination-previous-label", "Previous"),
                    text("Next", "pagination-next-label", "Next"),
                    text("Summary", "pagination-summary-template", "Page {page} of {pages}"),
                ],
            },
        ];
    }
}

function text(label: string, attribute: string, defaultValue: string) {
    return { type: "text" as const, label, attribute, defaultValue };
}

function select(label: string, attribute: string, defaultValue: string, values: string[]) {
    return {
        type: "select" as const,
        label,
        attribute,
        defaultValue,
        options: values.map((value) => ({ label: value, value })),
    };
}

registerEditor({ editor: CommerceAccountSalesEditor });
