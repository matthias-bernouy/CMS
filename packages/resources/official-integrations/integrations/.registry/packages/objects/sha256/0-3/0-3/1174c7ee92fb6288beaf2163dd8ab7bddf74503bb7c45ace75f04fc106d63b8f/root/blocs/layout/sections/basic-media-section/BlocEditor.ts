import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class BasicMediaSectionEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Media placement",
                        attribute: "media-position",
                        defaultValue: "start",
                        options: [
                            { label: "Start", value: "start" },
                            { label: "End", value: "end" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Vertical alignment",
                        attribute: "vertical-align",
                        defaultValue: "center",
                        options: [
                            { label: "Start", value: "start" },
                            { label: "Center", value: "center" },
                            { label: "End", value: "end" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Content width",
                        attribute: "width",
                        defaultValue: "wide",
                        options: [
                            { label: "Content", value: "content" },
                            { label: "Wide", value: "wide" },
                            { label: "Full", value: "full" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Spacing",
                        attribute: "density",
                        defaultValue: "regular",
                        options: [
                            { label: "Compact", value: "compact" },
                            { label: "Regular", value: "regular" },
                            { label: "Spacious", value: "spacious" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "select",
                        label: "Tone",
                        attribute: "tone",
                        defaultValue: "neutral",
                        options: BASIC_COLOR_SCHEME_OPTIONS,
                    },
                    {
                        type: "segmented",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "plain",
                        options: [
                            { label: "Plain", value: "plain" },
                            { label: "Soft", value: "soft" },
                            { label: "Filled", value: "filled" },
                            { label: "Outlined", value: "outlined" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Eyebrow", slot: "eyebrow", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Title", slot: "title", accepts: [{ kind: "component", tag: "h2" }], min: 1, max: 1 },
            { label: "Description", slot: "description", accepts: [{ kind: "component", tag: "p" }], max: 1 },
            { label: "Supporting content", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Actions", slot: "actions", accepts: [{ kind: "any-component" }], max: 2 },
            { label: "Media", slot: "media", accepts: [{ kind: "any-component" }], max: 1 },
        ];
    }
}

registerEditor({ editor: BasicMediaSectionEditor });
