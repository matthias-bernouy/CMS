import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Hello",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "hello",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Name",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "name",
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
