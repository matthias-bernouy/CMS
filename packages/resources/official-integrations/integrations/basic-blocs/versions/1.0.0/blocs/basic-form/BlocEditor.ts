import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BasicFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Submission",
                settings: [
                    {
                        type: "page-link",
                        label: "Redirect after success",
                        attribute: "cms-source-success-redirect",
                        defaultValue: "",
                        allowPage: true,
                        allowExternal: false,
                        allowMedia: false,
                    },
                    {
                        type: "segmented",
                        label: "Reset after success",
                        attribute: "cms-source-success-reset",
                        defaultValue: "true",
                        options: [
                            { label: "Yes", value: "true" },
                            { label: "No", value: "false" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Autocomplete",
                        attribute: "autocomplete",
                        defaultValue: "on",
                        options: [
                            { label: "On", value: "on" },
                            { label: "Off", value: "off" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Fields", accepts: [{ kind: "any-component" }], min: 1 }];
    }
}

registerEditor({ editor: BasicFormEditor });
