import {
    Editor,
    registerEditor,
    type ContentSlot,
} from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Title",
                slot: "title",
                min: 1,
                max: 1,
                accepts: [{ kind: "any-component" }],
            },
            {
                label: "Items",
                min: 1,
                accepts: [{ kind: "any-component" }],
            },
        ];
    }
}

registerEditor({ editor: BlocEditor });
