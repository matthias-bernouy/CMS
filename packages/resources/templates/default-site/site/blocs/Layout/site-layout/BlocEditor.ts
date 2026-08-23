import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

const slots: ContentSlot[] = [
    {
        "accepts": [
            {
                "kind": "any-component",
            },
        ],
        "label": "Content",
        "slot": "content",
    },
];

export class SiteCompositeBlocEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return slots;
    }
}

registerEditor({ editor: SiteCompositeBlocEditor });
