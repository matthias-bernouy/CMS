import {
    Editor,
    registerEditor,
    type ContentSlot,
    type SettingOption,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const sizes: SettingOption[] = [
    { label: "Extra small", value: "xs" },
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
    { label: "Extra large", value: "xl" },
    { label: "Full width", value: "full" },
];

export class MossaSectionEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Section",
                settings: [
                    {
                        type: "select",
                        label: "Surface",
                        attribute: "surface",
                        defaultValue: "page",
                        options: [
                            { label: "Page", value: "page" },
                            { label: "Raised", value: "raised" },
                            { label: "Subtle", value: "subtle" },
                            { label: "Primary", value: "primary" },
                            { label: "Secondary", value: "secondary" },
                        ],
                    },
                    { type: "select", label: "Content width", attribute: "size", defaultValue: "lg", options: sizes },
                    {
                        type: "select",
                        label: "Vertical spacing",
                        attribute: "spacing",
                        defaultValue: "lg",
                        options: [
                            { label: "None", value: "none" },
                            { label: "Small", value: "sm" },
                            { label: "Medium", value: "md" },
                            { label: "Large", value: "lg" },
                            { label: "Extra large", value: "xl" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Content", accepts: [{ kind: "any-component" }] }];
    }
}

registerEditor({ editor: MossaSectionEditor });
