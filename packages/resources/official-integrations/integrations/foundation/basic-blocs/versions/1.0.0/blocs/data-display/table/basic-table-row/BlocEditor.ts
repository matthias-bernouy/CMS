import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

export class BasicTableRowEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Navigation",
                slot: "navigation",
                max: 1,
                accepts: [{ kind: "component", tag: "a" }],
            },
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
