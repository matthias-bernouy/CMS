import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Link",
                accepts: [{ kind: "component", tag: "a" }],
                min: 1,
                max: 1,
            },
        ];
    }
}

registerEditor({ editor: BlocEditor });
