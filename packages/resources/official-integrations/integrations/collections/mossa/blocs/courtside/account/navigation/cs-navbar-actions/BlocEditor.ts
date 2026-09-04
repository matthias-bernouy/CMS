import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Cta",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "cta",
                "max": 1,
            },
            {
                "label": "Notifications",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "notifications",
                "max": 1,
            },
            {
                "label": "User",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "user",
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
