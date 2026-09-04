import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Input",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "input",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Send",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "send",
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
