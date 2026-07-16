import {
    Editor,
    registerEditor,
    type ColorSetting,
    type SettingSection,
    type TextCapability,
} from "@bernouy/cms-content/editor";
const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});
export class BasicCheckboxEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Field",
                settings: [
                    {
                        type: "select",
                        label: "Appearance",
                        attribute: "appearance",
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
                label: "Colors",
                settings: [
                    color("Text", "text-color"),
                    color("Background", "background-color"),
                    color("Border", "border-color"),
                    color("Selection", "accent-color"),
                    color("Check", "check-color"),
                ],
            },
        ];
    }
    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }
}
registerEditor({ editor: BasicCheckboxEditor });
