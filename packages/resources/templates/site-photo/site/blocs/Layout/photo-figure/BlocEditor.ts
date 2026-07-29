import { Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class PhotoFigureEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Image",
                settings: [
                    {
                        type: "select",
                        label: "Aspect ratio",
                        attribute: "aspect",
                        defaultValue: "auto",
                        options: ["auto", "portrait", "landscape", "square"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "segmented",
                        label: "Fit",
                        attribute: "fit",
                        defaultValue: "cover",
                        options: [
                            { label: "Cover", value: "cover" },
                            { label: "Contain", value: "contain" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        const accepts = [{ kind: "any-component" as const }];
        return [
            { label: "Media", slot: "media", min: 1, max: 1, accepts },
            { label: "Caption", slot: "caption", max: 1, accepts },
        ];
    }
}
