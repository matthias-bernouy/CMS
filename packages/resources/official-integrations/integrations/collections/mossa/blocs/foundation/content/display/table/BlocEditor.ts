import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class MossaTableEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Table",
                settings: [
                    {
                        type: "text",
                        label: "Caption",
                        attribute: "caption",
                        help: "Optional visible caption describing the table.",
                    },
                    {
                        type: "text",
                        label: "Accessible label",
                        attribute: "accessible-label",
                        help: "Use when the visible caption does not fully identify the table.",
                    },
                    {
                        type: "textarea",
                        label: "Columns",
                        attribute: "columns",
                        required: true,
                        help: 'A JSON array of column labels, for example ["Item", "Policy"].',
                    },
                    {
                        type: "textarea",
                        label: "Rows",
                        attribute: "rows",
                        required: true,
                        help: "A JSON array of rows. Every row must have exactly one value per column.",
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: MossaTableEditor });
