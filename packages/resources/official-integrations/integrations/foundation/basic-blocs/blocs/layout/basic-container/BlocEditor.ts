import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BasicContainerEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Width",
                        attribute: "width",
                        defaultValue: "content",
                        options: [
                            { label: "Content", value: "content" },
                            { label: "Wide", value: "wide" },
                            { label: "Full", value: "full" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Inline gutter",
                        attribute: "gutter",
                        defaultValue: "md",
                        options: [
                            { label: "None", value: "none" },
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "XL", value: "xl" },
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

registerEditor({ editor: BasicContainerEditor });
