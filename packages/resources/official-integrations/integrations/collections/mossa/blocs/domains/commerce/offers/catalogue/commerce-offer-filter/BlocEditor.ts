import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class CommerceOfferFilterEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Copy",
                settings: [
                    text("Brand label", "brand-label", "Brand"),
                    text("All brands", "brand-all-label", "All brands"),
                    text("Select a category", "select-category-label", "Select a category to see its filters."),
                    text("Advanced filters", "advanced-label", "Advanced filters"),
                    text("All values", "all-label", "All"),
                    text("Boolean true", "boolean-true-label", "Yes"),
                    text("Boolean false", "boolean-false-label", "No"),
                    text("Loading", "loading-label", "Loading filters…"),
                    text("Empty", "empty-label", "No additional filters for this category."),
                    text("Error", "error-label", "Filters for this category could not be loaded."),
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Additional filter controls", accepts: [{ kind: "any-component" }] }];
    }
}

function text(label: string, attribute: string, defaultValue: string) {
    return { type: "text" as const, label, attribute, defaultValue };
}

registerEditor({ editor: CommerceOfferFilterEditor });
