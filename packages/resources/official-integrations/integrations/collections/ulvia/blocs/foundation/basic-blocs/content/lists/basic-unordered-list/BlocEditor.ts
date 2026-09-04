import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

export class BasicUnorderedListEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Items",
                min: 1,
                accepts: [{ kind: "component", tag: "li" }],
            },
        ];
    }
}

registerEditor({ editor: BasicUnorderedListEditor });
