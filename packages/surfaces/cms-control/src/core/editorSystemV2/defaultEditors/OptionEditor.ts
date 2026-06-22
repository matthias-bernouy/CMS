import { Editor, type SettingSection, type TextCapability } from "@bernouy/cms-content/editor";

export class OptionEditor extends Editor {

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Option",
                settings: [
                    {
                        type: "text",
                        label: "Value",
                        attribute: "value",
                    },
                    {
                        type: "toggle",
                        label: "Selected",
                        attribute: "selected",
                        defaultValue: false,
                    },
                    {
                        type: "toggle",
                        label: "Disabled",
                        attribute: "disabled",
                        defaultValue: false,
                    },
                ],
            },
        ];
    }

    protected override textCapability(): TextCapability {
        return {
            format: "text",
            dynamic: true,
        };
    }

}
