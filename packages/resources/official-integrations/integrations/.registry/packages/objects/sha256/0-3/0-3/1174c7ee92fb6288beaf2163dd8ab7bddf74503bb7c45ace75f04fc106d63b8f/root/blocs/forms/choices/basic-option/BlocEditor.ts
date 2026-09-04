import { Editor, registerEditor, type SettingSection, type TextCapability } from "@bernouy/cms-content/editor";
export class BasicOptionEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Option",
                settings: [
                    { type: "text", label: "Value", attribute: "value" },
                    {
                        type: "segmented",
                        label: "Selected",
                        attribute: "selected",
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
        ];
    }
    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }
}
registerEditor({ editor: BasicOptionEditor });
