import { Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class PhotoSectionEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Width",
                        attribute: "width",
                        defaultValue: "wide",
                        options: ["copy", "content", "wide", "full"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Composition",
                        attribute: "layout",
                        defaultValue: "stack",
                        options: ["stack", "split", "sidebar"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Spacing",
                        attribute: "spacing",
                        defaultValue: "regular",
                        options: ["compact", "regular", "generous"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Divider",
                        attribute: "divider",
                        defaultValue: "none",
                        options: ["none", "top", "bottom", "both"].map((value) => ({ label: value, value })),
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        const accepts = [{ kind: "any-component" as const }];
        return [
            { label: "Heading", slot: "heading", max: 1, accepts },
            { label: "Aside", slot: "aside", max: 1, accepts },
            { label: "Content", accepts },
            { label: "Actions", slot: "actions", max: 1, accepts },
        ];
    }
}
