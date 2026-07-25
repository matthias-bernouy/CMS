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
                        "label": "Variant",
                        "attribute": "variant",
                        "defaultValue": "default",
                        "options": [
                            {
                                "label": "Default",
                                "value": "default",
                            },
                            {
                                "label": "Compact",
                                "value": "compact",
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
                "label": "Question",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "question",
                "max": 1,
            },
            {
                "label": "Thanks",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "thanks",
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
