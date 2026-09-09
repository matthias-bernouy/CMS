import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class PublicOfferEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Presentation and data",
                settings: [
                    toneSetting("Condition tone", "condition-tone", "neutral"),
                    toneSetting("Price tone", "price-tone", "primary"),
                    {
                        type: "segmented",
                        label: "Purchase panel",
                        attribute: "purchase-appearance",
                        defaultValue: "card",
                        options: [
                            { label: "Card", value: "card" },
                            { label: "Flat", value: "flat" },
                        ],
                    },
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
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            copySlot("Offer error title", "error-title"),
            copySlot("Offer error message", "error-message"),
            copySlot("Product error title", "product-error-title"),
            copySlot("Product error message", "product-error-message"),
            copySlot("Back link", "back-link"),
            copySlot("Model label", "model-label"),
            copySlot("Technical details label", "technical-details-label"),
            copySlot("Valuation label", "valuation-label"),
            copySlot("Price label", "price-label"),
            copySlot("Shipping message", "shipping-message"),
            copySlot("Buy link", "buy-link"),
            copySlot("Negotiation link", "negotiate-link"),
            copySlot("Secure payment label", "secure-payment-label"),
            copySlot("Buyer protection label", "buyer-protection-label"),
            copySlot("Tracked delivery label", "tracked-delivery-label"),
        ];
    }
}

function copySlot(label: string, slot: string): ContentSlot {
    return { label, slot, accepts: [{ kind: "any-component" }], min: 1, max: 1 };
}

function toneSetting(label: string, attribute: string, defaultValue: string) {
    return {
        type: "select" as const,
        label,
        attribute,
        defaultValue,
        options: [
            { label: "Primary", value: "primary" },
            { label: "Secondary", value: "secondary" },
            { label: "Neutral", value: "neutral" },
            { label: "Success", value: "success" },
            { label: "Warning", value: "warning" },
            { label: "Danger", value: "danger" },
            { label: "Info", value: "info" },
        ],
    };
}

registerEditor({ editor: PublicOfferEditor });
