import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Behavior",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Selection",
                        "attribute": "mode",
                        "defaultValue": "single",
                        "options": [
                            {
                                "label": "Single",
                                "value": "single",
                            },
                            {
                                "label": "Multiple",
                                "value": "multi",
                            },
                        ],
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Layout",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Alignment",
                        "attribute": "align",
                        "defaultValue": "left",
                        "options": [
                            {
                                "label": "Left",
                                "value": "left",
                            },
                            {
                                "label": "Center",
                                "value": "center",
                            },
                            {
                                "label": "Right",
                                "value": "right",
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
                "label": "Legend",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "legend",
                "max": 1,
            },
            {
                "label": "Chips",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
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
