import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "State",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Selected by default",
                        "attribute": "selected",
                        "options": [
                            {
                                "label": "Off",
                                "value": "",
                            },
                            {
                                "label": "On",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "",
                    },
                    {
                        "type": "text",
                        "label": "Value",
                        "attribute": "value",
                        "defaultValue": "value",
                        "placeholder": "value",
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
