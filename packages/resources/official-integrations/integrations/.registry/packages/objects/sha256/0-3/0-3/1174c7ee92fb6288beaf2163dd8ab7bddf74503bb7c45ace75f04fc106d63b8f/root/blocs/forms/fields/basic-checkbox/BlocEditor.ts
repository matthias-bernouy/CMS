import { Editor, registerEditor, type SettingSection, type TextCapability } from "@bernouy/cms-content/editor";
import { BASIC_COLOR_SCHEME_OPTIONS } from "./colorSchemes";
export class BasicCheckboxEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Field",
                settings: [
                    {
                        type: "select",
                        label: "Presentation",
                        attribute: "presentation",
                        defaultValue: "checkbox",
                        options: [
                            { label: "Checkbox", value: "checkbox" },
                            { label: "Switch", value: "switch" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Accessible label",
                        attribute: "accessible-label",
                        placeholder: "Enable notifications",
                    },
                    { type: "text", label: "Name", attribute: "name" },
                    {
                        type: "text",
                        label: "Value",
                        attribute: "value",
                        defaultValue: "on",
                    },
                    {
                        type: "text",
                        label: "Unchecked value",
                        attribute: "unchecked-value",
                    },
                ],
            },
            {
                kind: "self",
                label: "State",
                settings: [
                    {
                        type: "text",
                        label: "Checked state",
                        attribute: "checked-state",
                    },
                    {
                        type: "segmented",
                        label: "Checked by default",
                        attribute: "checked",
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
                        options: BASIC_COLOR_SCHEME_OPTIONS,
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
    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }
}
registerEditor({ editor: BasicCheckboxEditor });
