import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({ type: "color", label, attribute });

export class BasicPaginationEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Pagination",
                settings: [
                    { type: "text", label: "Page", attribute: "page", defaultValue: "1" },
                    { type: "text", label: "Total items", attribute: "total", defaultValue: "0" },
                    { type: "text", label: "Page size", attribute: "page-size", defaultValue: "12" },
                    { type: "text", label: "Previous label", attribute: "previous-label", defaultValue: "Précédent" },
                    { type: "text", label: "Next label", attribute: "next-label", defaultValue: "Suivant" },
                    {
                        type: "text",
                        label: "Summary template",
                        attribute: "summary-template",
                        defaultValue: "Page {page} sur {pages}",
                    },
                    {
                        type: "segmented",
                        label: "Summary",
                        attribute: "summary",
                        defaultValue: "visible",
                        options: [
                            { label: "Visible", value: "visible" },
                            { label: "Hidden", value: "hidden" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Alignment",
                        attribute: "justify",
                        defaultValue: "between",
                        options: [
                            { label: "Space between", value: "between" },
                            { label: "Start", value: "start" },
                            { label: "Center", value: "center" },
                            { label: "End", value: "end" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Text", "text-color"),
                    color("Button text", "button-text-color"),
                    color("Button background", "button-background-color"),
                    color("Button border", "button-border-color"),
                    color("Focus", "accent-color"),
                ],
            },
        ];
    }
}

registerEditor({ editor: BasicPaginationEditor });
