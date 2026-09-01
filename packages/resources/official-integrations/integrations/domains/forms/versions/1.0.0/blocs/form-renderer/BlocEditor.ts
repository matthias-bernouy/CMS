import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class FormsRendererEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Form",
                settings: [
                    { type: "text", label: "Form key", attribute: "form-key" },
                    {
                        type: "segmented",
                        label: "Access",
                        attribute: "access",
                        defaultValue: "public",
                        options: [
                            { label: "Public", value: "public" },
                            { label: "Signed in", value: "authenticated" },
                        ],
                    },
                    { type: "text", label: "Exact version (optional)", attribute: "version" },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Forms source", attribute: "source-id", defaultValue: "forms" },
                    {
                        type: "text",
                        label: "Source prefix",
                        attribute: "source-prefix",
                        defaultValue: "/.cms/sources",
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: FormsRendererEditor });
