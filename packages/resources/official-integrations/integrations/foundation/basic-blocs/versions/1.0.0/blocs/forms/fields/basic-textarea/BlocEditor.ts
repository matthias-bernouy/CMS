import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";
const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});
export class BasicTextareaEditor extends Editor {
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
                label: "Colors",
                settings: [
                    color("Text", "text-color"),
                    color("Background", "background-color"),
                    color("Border", "border-color"),
                    color("Focus", "accent-color"),
                ],
            },
        ];
    }
}
registerEditor({ editor: BasicTextareaEditor });
