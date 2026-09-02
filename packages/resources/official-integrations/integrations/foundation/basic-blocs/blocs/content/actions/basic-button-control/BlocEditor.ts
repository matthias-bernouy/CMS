import { Editor, registerEditor, type SettingSection, type TextCapability } from "@bernouy/cms-content/editor";

export class BasicButtonControlEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Button",
                settings: [
                    {
                        type: "segmented",
                        label: "Type",
                        attribute: "type",
                        defaultValue: "button",
                        options: [
                            { label: "Button", value: "button" },
                            { label: "Submit", value: "submit" },
                            { label: "Reset", value: "reset" },
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
                    { type: "text", label: "Name", attribute: "name" },
                    { type: "text", label: "Value", attribute: "value" },
                ],
            },
        ];
    }

    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }
}

registerEditor({ editor: BasicButtonControlEditor });
