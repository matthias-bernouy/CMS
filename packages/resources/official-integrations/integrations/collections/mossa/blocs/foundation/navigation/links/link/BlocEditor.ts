import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class MossaLinkEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "segmented",
                        label: "Tone",
                        attribute: "tone",
                        defaultValue: "accent",
                        options: [
                            { label: "Accent", value: "accent" },
                            { label: "Muted", value: "muted" },
                            { label: "Inherit", value: "inherit" },
                            { label: "Muted inherit", value: "inherit-muted" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Decoration",
                        attribute: "decoration",
                        defaultValue: "hover",
                        options: [
                            { label: "Hover", value: "hover" },
                            { label: "Always", value: "always" },
                            { label: "None", value: "none" },
                        ],
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: MossaLinkEditor });
