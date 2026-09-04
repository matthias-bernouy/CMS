import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class BasicNavbarEditor extends Editor {
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
                ],
            },
            {
                kind: "self",
                label: "Accessibility",
                settings: [
                    {
                        type: "text",
                        label: "Navigation label",
                        attribute: "navigation-label",
                        defaultValue: "Primary navigation",
                    },
                    {
                        type: "text",
                        label: "Open menu label",
                        attribute: "open-label",
                        defaultValue: "Open navigation",
                    },
                    {
                        type: "text",
                        label: "Close menu label",
                        attribute: "close-label",
                        defaultValue: "Close navigation",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Brand",
                slot: "brand",
                accepts: [{ kind: "any-component" }],
                max: 1,
            },
            {
                label: "Navigation",
                slot: "navigation",
                accepts: [{ kind: "component", tag: "a" }],
                min: 1,
            },
            {
                label: "Actions",
                slot: "actions",
                accepts: [{ kind: "component", tag: "a" }],
                max: 2,
            },
        ];
    }
}

registerEditor({ editor: BasicNavbarEditor });
