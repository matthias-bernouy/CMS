import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { MOSSA_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class MossaChipGroupEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Field",
                settings: [
                    { type: "text", label: "Label", attribute: "label" },
                    {
                        type: "text",
                        label: "Accessible label",
                        attribute: "accessible-label",
                        placeholder: "Choose an option",
                    },
                    { type: "text", label: "Name", attribute: "name" },
                    { type: "text", label: "Default value", attribute: "value" },
                ],
            },
            {
                kind: "self",
                label: "Behavior",
                settings: [
                    {
                        type: "segmented",
                        label: "Selection",
                        attribute: "mode",
                        defaultValue: "single",
                        options: [
                            { label: "Single", value: "single" },
                            { label: "Multiple", value: "multiple" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Required",
                        attribute: "required",
                        defaultValue: "",
                        options: [
                            { label: "No", value: "" },
                            { label: "Yes", value: "true" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Disabled",
                        attribute: "disabled",
                        defaultValue: "",
                        options: [
                            { label: "No", value: "" },
                            { label: "Yes", value: "true" },
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
                        defaultValue: "primary",
                        options: MOSSA_COLOR_SCHEME_OPTIONS,
                    },
                    {
                        type: "segmented",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "filled",
                        options: [
                            { label: "Filled", value: "filled" },
                            { label: "Soft", value: "soft" },
                            { label: "Outlined", value: "outlined" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Choices",
                accepts: [{ kind: "component", tag: "mossa-chip" }],
                min: 1,
            },
        ];
    }
}

registerEditor({ editor: MossaChipGroupEditor });
