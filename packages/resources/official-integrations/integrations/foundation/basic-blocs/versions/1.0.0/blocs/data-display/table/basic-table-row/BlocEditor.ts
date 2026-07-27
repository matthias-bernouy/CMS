import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BasicTableRowEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Link",
                settings: [
                    {
                        type: "page-link",
                        label: "Target",
                        attribute: "href",
                        allowPage: true,
                        allowExternal: true,
                        allowMedia: false,
                    },
                    {
                        type: "select",
                        label: "Open in",
                        attribute: "target",
                        defaultValue: "",
                        options: [
                            { label: "Same tab", value: "" },
                            { label: "New tab", value: "_blank" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Cells",
                min: 1,
                accepts: [
                    { kind: "component", tag: "basic-table-cell" },
                    { kind: "component", tag: "basic-table-header-cell" },
                ],
            },
        ];
    }
}

registerEditor({ editor: BasicTableRowEditor });
