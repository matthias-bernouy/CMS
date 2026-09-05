import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";
import { MOSSA_COLOR_SCHEME_OPTIONS } from "./colorSchemes";

export class MossaPaginationEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Pagination",
                settings: [
                    { type: "text", label: "Page", attribute: "page", defaultValue: "1" },
                    { type: "text", label: "Total items", attribute: "total", defaultValue: "0" },
                    { type: "text", label: "Page size", attribute: "page-size", defaultValue: "12" },
                    { type: "text", label: "Previous label", attribute: "previous-label", defaultValue: "Previous" },
                    { type: "text", label: "Next label", attribute: "next-label", defaultValue: "Next" },
                    {
                        type: "text",
                        label: "Summary template",
                        attribute: "summary-template",
                        defaultValue: "Page {page} of {pages}",
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
                label: "Style",
                settings: [
                    {
                        type: "select",
                        label: "Tone",
                        attribute: "tone",
                        defaultValue: "primary",
                        options: MOSSA_COLOR_SCHEME_OPTIONS,
                    },
                    {
                        type: "select",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "outlined",
                        options: [
                            { label: "Filled", value: "filled" },
                            { label: "Soft", value: "soft" },
                            { label: "Outlined", value: "outlined" },
                            { label: "Ghost", value: "ghost" },
                        ],
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: MossaPaginationEditor });
