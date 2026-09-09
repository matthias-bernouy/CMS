import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class CommerceOfferListEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Minimum card width",
                        attribute: "grid-min",
                        defaultValue: "md",
                        options: ["sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Maximum card width",
                        attribute: "grid-max",
                        defaultValue: "lg",
                        options: ["none", "sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "segmented",
                        label: "Column packing",
                        attribute: "grid-packing",
                        defaultValue: "fill",
                        options: [
                            { label: "Fill", value: "fill" },
                            { label: "Fit content", value: "fit" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Grid gap",
                        attribute: "grid-gap",
                        defaultValue: "md",
                        options: ["none", "xs", "sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                ],
            },
            {
                kind: "self",
                label: "Pagination",
                settings: [
                    {
                        type: "segmented",
                        label: "Scroll after page change",
                        attribute: "scroll-on-page-change",
                        defaultValue: "true",
                        options: [
                            { label: "Yes", value: "true" },
                            { label: "No", value: "false" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Catalogue content", accepts: [{ kind: "any-component" }] }];
    }
}

registerEditor({ editor: CommerceOfferListEditor });
