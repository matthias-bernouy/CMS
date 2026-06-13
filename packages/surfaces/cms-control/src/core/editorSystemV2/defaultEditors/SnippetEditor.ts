import { Editor, type EditorStructureMode, type SettingSection } from "@bernouy/cms-content/editor";

export class SnippetEditor extends Editor {

    protected override structureMode(): EditorStructureMode {
        return "opaque";
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Snippet",
                settings: [
                    {
                        type: "text",
                        label: "Identifier",
                        attribute: "identifier",
                        disabled: true,
                    },
                ],
            },
        ];
    }

}
