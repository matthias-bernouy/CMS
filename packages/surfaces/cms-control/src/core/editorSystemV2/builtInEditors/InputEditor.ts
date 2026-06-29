import { Editor, type SettingSection } from "@bernouy/cms-content/editor";

export class InputEditor extends Editor {

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Text input",
                settings: [
                    {
                        type: "select",
                        label: "Type",
                        attribute: "type",
                        defaultValue: "text",
                        options: [
                            { label: "Text", value: "text" },
                            { label: "Email", value: "email" },
                            { label: "Password", value: "password" },
                            { label: "Search", value: "search" },
                            { label: "Telephone", value: "tel" },
                            { label: "URL", value: "url" },
                            { label: "Number", value: "number" },
                            { label: "Submit", value: "submit" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Name",
                        attribute: "name",
                    },
                    {
                        type: "text",
                        label: "Placeholder",
                        attribute: "placeholder",
                    },
                    {
                        type: "text",
                        label: "Value",
                        attribute: "value",
                    },
                    {
                        type: "toggle",
                        label: "Required",
                        attribute: "required",
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

}
