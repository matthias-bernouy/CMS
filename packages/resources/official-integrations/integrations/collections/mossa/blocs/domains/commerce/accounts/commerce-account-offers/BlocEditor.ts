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

export class CommerceAccountOffersEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Edit label", attribute: "edit-label", defaultValue: "Change" },
                    { type: "page-link", label: "Edit page", attribute: "edit-url" },
                    {
                        type: "text",
                        label: "Define price label",
                        attribute: "price-label",
                        defaultValue: "Set my price",
                    },
                    { type: "page-link", label: "Define price page", attribute: "price-url" },
                    { type: "text", label: "View label", attribute: "view-label", defaultValue: "View" },
                    { type: "page-link", label: "View page", attribute: "view-url" },
                    {
                        type: "text",
                        label: "Empty title",
                        attribute: "empty-title",
                        defaultValue: "No offers yet",
                    },
                    {
                        type: "textarea",
                        label: "Empty message",
                        attribute: "empty-message",
                        defaultValue: "Create your first offer to start selling.",
                    },
                    {
                        type: "text",
                        label: "Filtered empty title",
                        attribute: "empty-filtered-title",
                        defaultValue: "No offer with this status",
                    },
                    {
                        type: "textarea",
                        label: "Filtered empty message",
                        attribute: "empty-filtered-message",
                        defaultValue: "Try another status to find your offers.",
                    },
                    { type: "textarea", label: "Error message", attribute: "error-message" },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
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
                        type: "select",
                        label: "Grid gap",
                        attribute: "grid-gap",
                        defaultValue: "md",
                        options: ["none", "xs", "sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    visible("Images", "show-image"),
                    visible("Prices", "show-price"),
                    visible("Statuses", "show-status"),
                    visible("Update dates", "show-updated-at"),
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Status filter", slot: "status-filter", accepts: [{ kind: "any-component" }], min: 1, max: 1 },
            { label: "Create action", slot: "create-action", accepts: [{ kind: "any-component" }], min: 1, max: 1 },
        ];
    }
}

registerEditor({ editor: CommerceAccountOffersEditor });
