import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";
import { MOSSA_COLOR_SCHEME_OPTIONS } from "./colorSchemes";
export class MossaTextareaEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Field",
                settings: [
                    { type: "text", label: "Label", attribute: "label" },
                    { type: "text", label: "Name", attribute: "name" },
                    {
                        type: "text",
                        label: "Placeholder",
                        attribute: "placeholder",
                    },
                    {
                        type: "text",
                        label: "Default value",
                        attribute: "value",
                    },
                    { type: "text", label: "Hint", attribute: "hint" },
                    { type: "text", label: "Rows", attribute: "rows" },
                ],
            },
            {
                kind: "self",
                label: "Validation",
                settings: [
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
                        type: "text",
                        label: "Minimum length",
                        attribute: "minlength",
                    },
                    {
                        type: "text",
                        label: "Maximum length",
                        attribute: "maxlength",
                    },
                ],
            },
            {
                kind: "self",
                label: "State",
                settings: [
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
                    {
                        type: "segmented",
                        label: "Read only",
                        attribute: "readonly",
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
}
registerEditor({ editor: MossaTextareaEditor });
