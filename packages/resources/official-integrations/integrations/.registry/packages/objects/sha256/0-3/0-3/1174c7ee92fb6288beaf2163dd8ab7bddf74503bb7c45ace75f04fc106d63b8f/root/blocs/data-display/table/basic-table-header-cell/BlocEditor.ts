import { Editor, registerEditor, type SettingSection, type TextCapability } from "@bernouy/cms-content/editor";

export class BasicTableHeaderCellEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Data",
                settings: [
                    {
                        type: "text",
                        label: "Sort parameter",
                        attribute: "sort",
                        help: "Value written to the sort query parameter.",
                    },
                    {
                        type: "text",
                        label: "Filter parameter",
                        attribute: "filter-name",
                        help: "Value written to a query parameter prefixed with f_.",
                    },
                    {
                        type: "text",
                        label: "Filter placeholder",
                        attribute: "filter-placeholder",
                        defaultValue: "Filter...",
                    },
                ],
            },
        ];
    }

    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }
}

registerEditor({ editor: BasicTableHeaderCellEditor });
