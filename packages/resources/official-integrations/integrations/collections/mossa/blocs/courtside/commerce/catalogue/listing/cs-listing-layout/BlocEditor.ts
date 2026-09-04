import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Filters",
                slot: "filters",
                accepts: [{ kind: "any-component" }],
                min: 1,
                max: 1,
            },
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
                min: 1,
            },
        ];
    }
}

registerEditor({ editor: BlocEditor });
