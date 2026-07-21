import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class CommerceOfferFilterEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Filter",
                settings: [
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
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Filter control", accepts: [{ kind: "any-component" }] }];
    }
}

registerEditor({ editor: CommerceOfferFilterEditor });
