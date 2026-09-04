import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Layout",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Column balance",
                        "attribute": "balance",
                        "defaultValue": "",
                        "options": [
                            {
                                "label": "Right-heavy (default)",
                                "value": "",
                            },
                            {
                                "label": "Even (1/1)",
                                "value": "even",
                            },
                            {
                                "label": "Left-heavy",
                                "value": "left-heavy",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Sticky left column",
                        "attribute": "sticky",
                        "defaultValue": "",
                        "options": [
                            {
                                "label": "On (default)",
                                "value": "",
                            },
                            {
                                "label": "Off",
                                "value": "none",
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
                "label": "Left",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "left",
                "min": 1,
            },
            {
                "label": "Right",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "right",
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
