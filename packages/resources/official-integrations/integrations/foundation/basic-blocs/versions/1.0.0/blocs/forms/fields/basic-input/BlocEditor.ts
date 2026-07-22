import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});

export class BasicInputEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Field",
                settings: [
                    {
                        type: "text",
                        label: "Label",
                        attribute: "label",
                        placeholder: "Label",
                    },
                    {
                        type: "text",
                        label: "Name",
                        attribute: "name",
                        placeholder: "field",
                    },
                    {
                        type: "select",
                        label: "Type",
                        attribute: "type",
                        defaultValue: "text",
                        options: [
                            "text",
                            "email",
                            "password",
                            "tel",
                            "number",
                            "search",
                            "url",
                            "date",
                            "time",
                            "datetime-local",
                        ].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "text",
                        label: "Placeholder",
                        attribute: "placeholder",
                        visibleWhen: {
                            attribute: "type",
                            equals: ["text", "email", "password", "tel", "search", "url", "number"],
                        },
                    },
                    {
                        type: "select",
                        label: "Date format",
                        attribute: "date-format",
                        defaultValue: "",
                        visibleWhen: { attribute: "type", equals: "date" },
                        options: [
                            { label: "Browser locale", value: "" },
                            { label: "DD/MM/YYYY", value: "day-month-year" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Default value",
                        attribute: "value",
                    },
                    {
                        type: "text",
                        label: "Autocomplete",
                        attribute: "autocomplete",
                        placeholder: "email",
                    },
                    { type: "text", label: "Hint", attribute: "hint" },
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
                        label: "Minimum",
                        attribute: "min",
                        visibleWhen: {
                            attribute: "type",
                            equals: ["number", "date", "time", "datetime-local"],
                        },
                    },
                    {
                        type: "text",
                        label: "Maximum",
                        attribute: "max",
                        visibleWhen: {
                            attribute: "type",
                            equals: ["number", "date", "time", "datetime-local"],
                        },
                    },
                    {
                        type: "text",
                        label: "Step",
                        attribute: "step",
                        visibleWhen: {
                            attribute: "type",
                            equals: ["number", "date", "time", "datetime-local"],
                        },
                    },
                    {
                        type: "text",
                        label: "Minimum length",
                        attribute: "minlength",
                        visibleWhen: {
                            attribute: "type",
                            equals: ["text", "email", "password", "tel", "search", "url"],
                        },
                    },
                    {
                        type: "text",
                        label: "Maximum length",
                        attribute: "maxlength",
                        visibleWhen: {
                            attribute: "type",
                            equals: ["text", "email", "password", "tel", "search", "url"],
                        },
                    },
                    {
                        type: "text",
                        label: "Pattern",
                        attribute: "pattern",
                        visibleWhen: {
                            attribute: "type",
                            equals: ["text", "email", "password", "tel", "search", "url"],
                        },
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

registerEditor({ editor: BasicInputEditor });
