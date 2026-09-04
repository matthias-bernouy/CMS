import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class RestaurantContactItemEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Presentation",
                settings: [
                    {
                        type: "segmented",
                        label: "Icon",
                        attribute: "icon-style",
                        defaultValue: "soft",
                        options: [
                            { label: "Soft", value: "soft" },
                            { label: "Outline", value: "outline" },
                            { label: "Plain", value: "plain" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Alignment",
                        attribute: "alignment",
                        defaultValue: "horizontal",
                        options: [
                            { label: "Horizontal", value: "horizontal" },
                            { label: "Stacked", value: "stacked" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Icon", slot: "icon", accepts: [{ kind: "component", tag: "svg" }], max: 1 },
            { label: "Label", slot: "label", accepts: [{ kind: "any-component" }], max: 1 },
            {
                label: "Value",
                slot: "value",
                accepts: [
                    { kind: "component", tag: "a" },
                    { kind: "component", tag: "span" },
                    { kind: "component", tag: "p" },
                ],
                min: 1,
                max: 1,
            },
            { label: "Note", slot: "note", accepts: [{ kind: "any-component" }], max: 1 },
        ];
    }
}

registerEditor({ editor: RestaurantContactItemEditor });
