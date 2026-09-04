import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BasicTableEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Accessibility",
                settings: [
                    {
                        type: "text",
                        label: "Accessible label",
                        attribute: "accessible-label",
                        help: "Briefly identify the data presented by the table.",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Header",
                slot: "header",
                max: 1,
                accepts: [{ kind: "component", tag: "basic-table-row" }],
            },
            {
                label: "Rows",
                min: 1,
                accepts: [{ kind: "component", tag: "basic-table-row" }],
            },
        ];
    }
}

registerEditor({ editor: BasicTableEditor });
