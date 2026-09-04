import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class BasicToastEditor extends Editor {
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
                        defaultValue: "soft",
                        options: [
                            { label: "Soft", value: "soft" },
                            { label: "Filled", value: "filled" },
                            { label: "Outlined", value: "outlined" },
                            { label: "Ghost", value: "ghost" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Placement",
                settings: [
                    {
                        type: "select",
                        label: "Position",
                        attribute: "position",
                        defaultValue: "top-right",
                        options: [
                            { label: "Top right", value: "top-right" },
                            { label: "Top left", value: "top-left" },
                            { label: "Bottom right", value: "bottom-right" },
                            { label: "Bottom left", value: "bottom-left" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Width",
                        attribute: "width",
                        defaultValue: "auto",
                        options: [
                            { label: "Auto", value: "auto" },
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                            { label: "Full", value: "full" },
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
                        label: "Radius",
                        attribute: "radius",
                        defaultValue: "md",
                        options: [
                            { label: "None", value: "none" },
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                            { label: "Pill", value: "pill" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Shadow",
                        attribute: "shadow",
                        defaultValue: "none",
                        options: [
                            { label: "None", value: "none" },
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Behavior",
                settings: [
                    {
                        type: "text",
                        label: "Duration in milliseconds",
                        attribute: "duration",
                        defaultValue: "4500",
                        help: "Use 0 to keep the notification visible until it is dismissed.",
                    },
                    {
                        type: "toggle",
                        label: "Dismissible",
                        attribute: "dismissible",
                        defaultValue: true,
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Icon",
                slot: "icon",
                accepts: [{ kind: "any-component" }],
                max: 1,
            },
            {
                label: "Message",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }
}

registerEditor({ editor: BasicToastEditor });
