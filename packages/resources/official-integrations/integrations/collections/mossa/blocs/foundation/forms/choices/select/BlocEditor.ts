import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { MOSSA_COLOR_SCHEME_OPTIONS } from "./colorSchemes";
export class MossaSelectEditor extends Editor {
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
                        placeholder: "Select an option",
                    },
                    { type: "text", label: "Name", attribute: "name" },
                    {
                        type: "text",
                        label: "Default value",
                        attribute: "value",
                    },
                    {
                        type: "text",
                        label: "Placeholder",
                        attribute: "placeholder",
                        defaultValue: "Select an option",
                    },
                    { type: "text", label: "Hint", attribute: "hint" },
                ],
            },
            {
                kind: "self",
                label: "Behavior",
                settings: [
                    {
                        type: "segmented",
                        label: "Presentation",
                        attribute: "presentation",
                        defaultValue: "auto",
                        options: [
                            { label: "Auto", value: "auto" },
                            { label: "Native", value: "native" },
                            { label: "Custom", value: "custom" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Multiple",
                        attribute: "multiple",
                        defaultValue: "",
                        options: [
                            { label: "No", value: "" },
                            { label: "Yes", value: "true" },
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
                        type: "select",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "outlined",
                        options: [
                            { label: "Outlined", value: "outlined" },
                            { label: "Soft", value: "soft" },
                            { label: "Filled", value: "filled" },
                            { label: "Ghost", value: "ghost" },
                        ],
                    },
                ],
            },
        ];
    }
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Options",
                accepts: [{ kind: "component", tag: "mossa-option" }],
                min: 1,
            },
        ];
    }
}
registerEditor({ editor: MossaSelectEditor });
