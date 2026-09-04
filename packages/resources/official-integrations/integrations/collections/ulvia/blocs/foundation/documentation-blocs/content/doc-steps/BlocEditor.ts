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
                        "label": "Variant",
                        "attribute": "variant",
                        "options": [
                            {
                                "label": "Numbered",
                                "value": "numbered",
                            },
                            {
                                "label": "Checked",
                                "value": "checked",
                            },
                            {
                                "label": "Bulleted",
                                "value": "bulleted",
                            },
                        ],
                        "defaultValue": "numbered",
                    },
                    {
                        "type": "segmented",
                        "label": "Spacing",
                        "attribute": "spacing",
                        "defaultValue": "regular",
                        "options": [
                            {
                                "label": "Compact",
                                "value": "compact",
                            },
                            {
                                "label": "Regular",
                                "value": "regular",
                            },
                            {
                                "label": "Spacious",
                                "value": "spacious",
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
                "label": "Steps",
                "accepts": [
                    {
                        "kind": "component",
                        "tag": "doc-step",
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
