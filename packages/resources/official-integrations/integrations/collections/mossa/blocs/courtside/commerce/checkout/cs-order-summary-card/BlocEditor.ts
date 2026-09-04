import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Product image",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["image"],
                    },
                ],
                "slot": "image",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Badge",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "badge",
                "max": 1,
            },
            {
                "label": "Title",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "title",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "label",
                "min": 1,
            },
            {
                "label": "Total Label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "total-label",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Total Value",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "total-value",
                "min": 1,
                "max": 1,
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
