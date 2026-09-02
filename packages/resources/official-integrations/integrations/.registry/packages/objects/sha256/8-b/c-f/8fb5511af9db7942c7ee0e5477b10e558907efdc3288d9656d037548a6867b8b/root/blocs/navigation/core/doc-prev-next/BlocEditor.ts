import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Previous page",
                "settings": [
                    {
                        "type": "page-link",
                        "label": "Target page",
                        "attribute": "prev-href",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Next page",
                "settings": [
                    {
                        "type": "page-link",
                        "label": "Target page",
                        "attribute": "next-href",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Prev Title",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "prev-title",
                "max": 1,
            },
            {
                "label": "Next Title",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "next-title",
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
