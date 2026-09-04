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
                        "type": "select",
                        "label": "Decimals",
                        "attribute": "decimals",
                        "options": [
                            {
                                "label": "0",
                                "value": "0",
                            },
                            {
                                "label": "1",
                                "value": "1",
                            },
                            {
                                "label": "2",
                                "value": "2",
                            },
                        ],
                        "defaultValue": "0",
                    },
                    {
                        "type": "select",
                        "label": "Animation speed",
                        "attribute": "duration",
                        "options": [
                            {
                                "label": "Fast",
                                "value": "800",
                            },
                            {
                                "label": "Normal",
                                "value": "1600",
                            },
                            {
                                "label": "Slow",
                                "value": "2400",
                            },
                            {
                                "label": "None",
                                "value": "0",
                            },
                        ],
                        "defaultValue": "1600",
                    },
                ],
            },
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
                                "label": "Default",
                                "value": "default",
                            },
                            {
                                "label": "Card",
                                "value": "card",
                            },
                            {
                                "label": "Accent",
                                "value": "accent",
                            },
                        ],
                        "defaultValue": "default",
                    },
                    {
                        "type": "select",
                        "label": "Size",
                        "attribute": "size",
                        "options": [
                            {
                                "label": "Small",
                                "value": "sm",
                            },
                            {
                                "label": "Medium",
                                "value": "md",
                            },
                            {
                                "label": "Large",
                                "value": "lg",
                            },
                            {
                                "label": "Extra large",
                                "value": "xl",
                            },
                        ],
                        "defaultValue": "md",
                    },
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
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
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
            {
                "label": "Prefix",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "prefix",
                "max": 1,
            },
            {
                "label": "Suffix",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "suffix",
                "max": 1,
            },
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
                "label": "Trend",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "trend",
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
