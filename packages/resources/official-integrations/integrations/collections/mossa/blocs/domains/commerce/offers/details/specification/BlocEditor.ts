import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Style",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Emphasis",
                        "attribute": "emphasis",
                        "defaultValue": "",
                        "options": [
                            {
                                "label": "Default",
                                "value": "",
                            },
                            {
                                "label": "Price (prominent)",
                                "value": "price",
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
                "label": "Label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "label",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Value",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "value",
                "min": 1,
                "max": 1,
            },
        ];
    }
    // -- End generated editor metadata --

    constructor(target: HTMLElement) {
        super(target);
    }
    override mountEditor(): void {}
    override unmountEditor(): void {}
}

registerEditor({ editor: BlocEditor });
