import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class CommerceOfferFilterEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Filter",
                settings: [
                    {
                        type: "segmented",
                        label: "Schema-driven panel",
                        attribute: "schema-driven",
                        defaultValue: "false",
                        options: [
                            { label: "Static field", value: "false" },
                            { label: "Dynamic panel", value: "true" },
                        ],
                    },
                    { type: "text", label: "Product field", attribute: "field" },
                    {
                        type: "select",
                        label: "Operator",
                        attribute: "operator",
                        defaultValue: "eq",
                        options: [
                            { label: "Equals", value: "eq" },
                            { label: "One of", value: "in" },
                            { label: "Minimum", value: "gte" },
                            { label: "Maximum", value: "lte" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Category URL parameter",
                        attribute: "category-param",
                        defaultValue: "category",
                    },
                ],
            },
            {
                kind: "self",
                label: "Filter copy",
                settings: [
                    { type: "text", label: "All options", attribute: "all-label", defaultValue: "All" },
                    { type: "text", label: "True option", attribute: "boolean-true-label", defaultValue: "Yes" },
                    { type: "text", label: "False option", attribute: "boolean-false-label", defaultValue: "No" },
                    { type: "text", label: "Error message", attribute: "error-label" },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Filter control", accepts: [{ kind: "any-component" }] }];
    }
}

registerEditor({ editor: CommerceOfferFilterEditor });
