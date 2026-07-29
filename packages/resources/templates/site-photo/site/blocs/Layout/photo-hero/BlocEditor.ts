import { Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class PhotoHeroEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Composition",
                        attribute: "layout",
                        defaultValue: "split",
                        options: [
                            { label: "Split", value: "split" },
                            { label: "Stacked", value: "stacked" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Scale",
                        attribute: "scale",
                        defaultValue: "display",
                        options: [
                            { label: "Display", value: "display" },
                            { label: "Page", value: "page" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        const accepts = [{ kind: "any-component" as const }];
        return [
            { label: "Eyebrow", slot: "eyebrow", max: 1, accepts },
            { label: "Title", slot: "title", max: 1, accepts },
            { label: "Summary", slot: "summary", max: 1, accepts },
            { label: "Actions", slot: "actions", max: 1, accepts },
        ];
    }
}
