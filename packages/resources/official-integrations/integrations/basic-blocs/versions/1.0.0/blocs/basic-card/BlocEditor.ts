import {
    Editor,
    registerEditor,
    type ColorSetting,
    type ContentSlot,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});

export class BasicCardEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "outlined",
                        options: [
                            { label: "Plain", value: "plain" },
                            { label: "Outlined", value: "outlined" },
                            { label: "Elevated", value: "elevated" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Density",
                        attribute: "density",
                        defaultValue: "regular",
                        options: [
                            { label: "Compact", value: "compact" },
                            { label: "Regular", value: "regular" },
                            { label: "Spacious", value: "spacious" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Height",
                        attribute: "stretch",
                        defaultValue: "false",
                        options: [
                            { label: "Content", value: "false" },
                            { label: "Stretch", value: "true" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Text", "text-color"),
                    color("Muted text", "muted-text-color"),
                    color("Background", "background-color"),
                    color("Border", "border-color"),
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Media",
                slot: "media",
                accepts: [{ kind: "any-component" }],
                max: 1,
            },
            {
                label: "Title",
                slot: "title",
                accepts: [{ kind: "any-component" }],
                max: 1,
            },
            {
                label: "Description",
                slot: "description",
                accepts: [{ kind: "any-component" }],
                max: 1,
            },
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
            {
                label: "Actions",
                slot: "actions",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }
}

registerEditor({ editor: BasicCardEditor });
