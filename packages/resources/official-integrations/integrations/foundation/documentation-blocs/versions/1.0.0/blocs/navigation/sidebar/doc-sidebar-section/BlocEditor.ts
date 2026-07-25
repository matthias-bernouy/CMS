import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Title",
                "accepts": [
                    {
                        "kind": "component",
                        "tag": "doc-sidebar-link",
                    },
                ],
                "slot": "title",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Links",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "min": 1,
            },
        ];
    }
    // -- End generated legacy editor metadata --

    constructor(target: HTMLElement) {
        super(target);
    }
    override mountEditor(): void {}
    override unmountEditor(): void {}
}

registerEditor({ editor: BlocEditor });
