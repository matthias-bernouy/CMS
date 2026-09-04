import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Style",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Layout",
                        "attribute": "layout",
                        "defaultValue": "side-by-side",
                        "options": [
                            {
                                "label": "Side by side",
                                "value": "side-by-side",
                            },
                            {
                                "label": "Unified",
                                "value": "unified",
                            },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Before",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "before",
                "min": 1,
            },
            {
                "label": "After",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "after",
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
