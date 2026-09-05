import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class CommerceOfferListEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Minimum card width",
                        attribute: "grid-min",
                        defaultValue: "md",
                        options: ["sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Maximum card width",
                        attribute: "grid-max",
                        defaultValue: "lg",
                        options: ["none", "sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "segmented",
                        label: "Column packing",
                        attribute: "grid-packing",
                        defaultValue: "fill",
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
                    {
                        type: "segmented",
                        label: "Card height",
                        attribute: "card-stretch",
                        defaultValue: "true",
                        options: [
                            { label: "Content", value: "false" },
                            { label: "Stretch", value: "true" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Pagination",
                settings: [
                    { type: "text", label: "Items per page", attribute: "page-size", defaultValue: "12" },
                    { type: "text", label: "Page URL parameter", attribute: "page-param", defaultValue: "page" },
                    {
                        type: "segmented",
                        label: "Synchronize page with URL",
                        attribute: "sync-url",
                        defaultValue: "true",
                        options: [
                            { label: "Yes", value: "true" },
                            { label: "No", value: "false" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Scroll after page change",
                        attribute: "scroll-on-page-change",
                        defaultValue: "true",
                        options: [
                            { label: "Yes", value: "true" },
                            { label: "No", value: "false" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Fixed filters",
                settings: [
                    { type: "text", label: "Category", attribute: "category" },
                    { type: "text", label: "Brand", attribute: "brand" },
                    { type: "text", label: "Product id", attribute: "product-id" },
                    { type: "text", label: "Variant id", attribute: "variant-id" },
                    { type: "text", label: "Seller id", attribute: "seller-id" },
                    { type: "text", label: "Condition", attribute: "condition-code" },
                    { type: "text", label: "Minimum price", attribute: "minimum-price" },
                    { type: "text", label: "Maximum price", attribute: "maximum-price" },
                    {
                        type: "select",
                        label: "Sort",
                        attribute: "sort",
                        options: [
                            { label: "Most recent", value: "" },
                            { label: "Price ascending", value: "price-asc" },
                            { label: "Price descending", value: "price-desc" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Data alias", attribute: "data-alias", defaultValue: "data" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "en-US" },
                ],
            },
            {
                kind: "self",
                label: "Navigation",
                settings: [{ type: "text", label: "Offer URL pattern", attribute: "offer-url" }],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Catalogue content", accepts: [{ kind: "any-component" }] }];
    }
}

registerEditor({ editor: CommerceOfferListEditor });
