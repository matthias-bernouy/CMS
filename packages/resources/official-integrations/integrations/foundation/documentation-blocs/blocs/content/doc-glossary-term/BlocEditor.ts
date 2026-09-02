import { Editor, registerEditor, type ContentSlot, type TextCapability } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }

    // -- Generated from legacy editor metadata --

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Definition",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "definition",
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
