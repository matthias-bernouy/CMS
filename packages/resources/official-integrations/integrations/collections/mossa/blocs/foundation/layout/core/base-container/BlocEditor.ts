import {
    Editor,
    registerEditor,
    type ContentSlot,
    type SettingOption,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const containerSizeOptions: SettingOption[] = [
    { label: "Extra small", value: "xs" },
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
    { label: "Extra large", value: "xl" },
    { label: "Full width", value: "full" },
];

const alignmentOptions: SettingOption[] = [
    { label: "Start", value: "start" },
    { label: "Center", value: "center" },
    { label: "End", value: "end" },
];

export class ContainerEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Container",
                settings: [
                    {
                        type: "select",
                        label: "Size",
                        attribute: "size",
                        defaultValue: "md",
                        options: containerSizeOptions,
                    },
                    {
                        type: "segmented",
                        label: "Align self",
                        attribute: "align-self",
                        defaultValue: "start",
                        options: alignmentOptions,
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: ContainerEditor });
