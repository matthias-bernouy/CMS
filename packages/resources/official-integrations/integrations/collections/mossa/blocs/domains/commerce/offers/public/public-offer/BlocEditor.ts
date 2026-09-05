import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class PublicOfferEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Price label", attribute: "price-label", defaultValue: "Seller price" },
                    {
                        type: "text",
                        label: "Valuation label",
                        attribute: "valuation-label",
                        defaultValue: "Reference value",
                    },
                    {
                        type: "text",
                        label: "Shipping message",
                        attribute: "shipping-message",
                        defaultValue: "Delivery is available",
                    },
                    { type: "text", label: "Buy label", attribute: "buy-label", defaultValue: "Buy" },
                    {
                        type: "text",
                        label: "Negotiation label",
                        attribute: "negotiate-label",
                        defaultValue: "Make an offer",
                    },
                    {
                        type: "text",
                        label: "Error title",
                        attribute: "error-title",
                        defaultValue: "Offer not found",
                    },
                    {
                        type: "textarea",
                        label: "Error message",
                        attribute: "error-message",
                        defaultValue: "This offer is no longer available or does not exist.",
                    },
                    { type: "text", label: "Back label", attribute: "back-label", defaultValue: "Back to offers" },
                ],
            },
            {
                kind: "self",
                label: "Links and data",
                settings: [
                    { type: "text", label: "Slug URL parameter", attribute: "slug-param", defaultValue: "slug" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "en-US" },
                    {
                        type: "text",
                        label: "Valuation minimum field",
                        attribute: "valuation-minimum-field",
                        defaultValue: "valuationMinimum",
                    },
                    {
                        type: "text",
                        label: "Valuation maximum field",
                        attribute: "valuation-maximum-field",
                        defaultValue: "valuationMaximum",
                    },
                    {
                        type: "text",
                        label: "Valuation currency",
                        attribute: "valuation-currency",
                        defaultValue: "USD",
                    },
                    {
                        type: "segmented",
                        label: "Main image fit",
                        attribute: "image-fit",
                        defaultValue: "contain",
                        options: [
                            { label: "Contain", value: "contain" },
                            { label: "Cover", value: "cover" },
                            { label: "Fill", value: "fill" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Buy URL pattern",
                        attribute: "buy-url",
                    },
                    {
                        type: "text",
                        label: "Negotiation URL pattern",
                        attribute: "negotiate-url",
                    },
                ],
            },
        ];
    }
}
registerEditor({ editor: PublicOfferEditor });
