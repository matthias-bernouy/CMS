import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Currency", attribute: "currency", defaultValue: "USD" },
                    {
                        type: "text",
                        label: "Minimum value field",
                        attribute: "valuation-minimum-field",
                        defaultValue: "valuationMinimum",
                    },
                    {
                        type: "text",
                        label: "Maximum value field",
                        attribute: "valuation-maximum-field",
                        defaultValue: "valuationMaximum",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            copySlot("Heading eyebrow", "heading-eyebrow"),
            copySlot("Heading title", "heading-title"),
            copySlot("Heading subtitle", "heading-subtitle"),
            copySlot("Model chooser label", "choose-model-label"),
            copySlot("Search accessible label", "search-accessible-label"),
            copySlot("Search placeholder", "search-placeholder"),
            copySlot("Clear search label", "clear-search-label"),
            copySlot("Result eyebrow", "result-eyebrow"),
            copySlot("Reference range label", "reference-range-label"),
            copySlot("Model reference label", "model-reference-label"),
            copySlot("Model reference description", "model-reference-description"),
            copySlot("Initial title", "initial-title"),
            copySlot("Initial description", "initial-description"),
            copySlot("Start typing message", "start-typing-message"),
            copySlot("Searching message", "searching-message"),
            copySlot("One model message", "model-count-one-message"),
            copySlot("Several models message", "model-count-many-message"),
            copySlot("No model message", "no-model-message"),
            copySlot("Unavailable message", "unavailable-message"),
            copySlot("Selected model message", "selected-model-message"),
            copySlot("Catalogue product label", "catalogue-product-label"),
            copySlot("Pending range label", "range-pending-label"),
            copySlot("Pending range description", "range-pending-description"),
            copySlot("Range description", "range-description"),
        ];
    }
}

function copySlot(label: string, slot: string): ContentSlot {
    return { label, slot, accepts: [{ kind: "any-component" }], min: 1, max: 1 };
}

registerEditor({ editor: BlocEditor });
