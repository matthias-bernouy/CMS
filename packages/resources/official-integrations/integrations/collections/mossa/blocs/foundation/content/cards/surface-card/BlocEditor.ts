import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { MOSSA_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class MossaSurfaceCardEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "select",
                        label: "Tone",
                        attribute: "tone",
                        defaultValue: "neutral",
                        options: MOSSA_COLOR_SCHEME_OPTIONS,
                    },
                    {
                        type: "select",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "outlined",
                        options: [
                            { label: "Filled", value: "filled" },
                            { label: "Soft", value: "soft" },
                            { label: "Outlined", value: "outlined" },
                            { label: "Ghost", value: "ghost" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Elevation",
                        attribute: "elevation",
                        defaultValue: "flat",
                        options: [
                            { label: "Flat", value: "flat" },
                            { label: "Elevated", value: "elevated" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
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

registerEditor({ editor: MossaSurfaceCardEditor });
