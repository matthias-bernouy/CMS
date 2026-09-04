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
                        "type": "select",
                        "label": "Layout",
                        "attribute": "layout",
                        "options": [
                            {
                                "label": "Vertical",
                                "value": "vertical",
                            },
                            {
                                "label": "Horizontal",
                                "value": "horizontal",
                            },
                        ],
                        "defaultValue": "vertical",
                    },
                    {
                        "type": "segmented",
                        "label": "Required",
                        "attribute": "required",
                        "options": [
                            {
                                "label": "No",
                                "value": "",
                            },
                            {
                                "label": "Yes",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "",
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
                "label": "Control",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "control",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Help",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "help",
                "max": 1,
            },
            {
                "label": "Error",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "error",
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
