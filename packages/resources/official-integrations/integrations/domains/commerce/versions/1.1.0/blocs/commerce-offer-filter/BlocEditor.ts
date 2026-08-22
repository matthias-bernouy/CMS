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
                    { type: "text", label: "Commerce source", attribute: "source-id", defaultValue: "commerce" },
                    {
                        type: "text",
                        label: "Schema endpoint",
                        attribute: "schema-endpoint",
                        defaultValue: "offerFilterSchema",
                    },
                    {
                        type: "text",
                        label: "Category URL parameter",
                        attribute: "category-param",
                        defaultValue: "category",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Filter control", accepts: [{ kind: "any-component" }] }];
    }
}

registerEditor({ editor: CommerceOfferFilterEditor });
