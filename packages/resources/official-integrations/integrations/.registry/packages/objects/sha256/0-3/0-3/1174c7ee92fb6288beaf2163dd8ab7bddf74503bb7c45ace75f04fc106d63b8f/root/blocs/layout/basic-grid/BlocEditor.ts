import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

const gaps = [
    { label: "None", value: "none" },
    { label: "XS", value: "xs" },
    { label: "S", value: "sm" },
    { label: "M", value: "md" },
    { label: "L", value: "lg" },
    { label: "XL", value: "xl" },
];

export class BasicGridEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Minimum item width",
                        attribute: "min",
                        defaultValue: "md",
                        options: [
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                            { label: "XL", value: "xl" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Maximum item width",
                        attribute: "max",
                        defaultValue: "none",
                        options: [
                            { label: "None", value: "none" },
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                            { label: "XL", value: "xl" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Column packing",
                        attribute: "packing",
                        defaultValue: "fill",
                        options: [
                            { label: "Fill", value: "fill" },
                            { label: "Fit content", value: "fit" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Gap",
                        attribute: "gap",
                        defaultValue: "md",
                        options: gaps,
                    },
                    {
                        type: "segmented",
                        label: "Item alignment",
                        attribute: "justify-items",
                        defaultValue: "stretch",
                        options: [
                            { label: "Start", value: "start" },
                            { label: "Center", value: "center" },
                            { label: "End", value: "end" },
                            { label: "Stretch", value: "stretch" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "select",
                        label: "Tone",
                        attribute: "tone",
                        defaultValue: "neutral",
                        options: BASIC_COLOR_SCHEME_OPTIONS,
                    },
                    {
                        type: "segmented",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "plain",
                        options: [
                            { label: "Plain", value: "plain" },
                            { label: "Soft", value: "soft" },
                            { label: "Filled", value: "filled" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Items", accepts: [{ kind: "any-component" }] }];
    }
}

registerEditor({ editor: BasicGridEditor });
