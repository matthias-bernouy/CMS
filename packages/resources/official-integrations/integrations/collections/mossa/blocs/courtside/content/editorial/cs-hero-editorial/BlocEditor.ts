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
                        "label": "Tone",
                        "attribute": "tone",
                        "defaultValue": "default",
                        "options": [
                            {
                                "label": "Default (secondary)",
                                "value": "default",
                            },
                            {
                                "label": "Cream",
                                "value": "cream",
                            },
                            {
                                "label": "White",
                                "value": "white",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Alignment",
                        "attribute": "align",
                        "defaultValue": "center",
                        "options": [
                            {
                                "label": "Center",
                                "value": "center",
                            },
                            {
                                "label": "Left",
                                "value": "left",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Padding",
                        "attribute": "density",
                        "defaultValue": "default",
                        "options": [
                            {
                                "label": "Compact",
                                "value": "compact",
                            },
                            {
                                "label": "Default",
                                "value": "default",
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
                "label": "Eyebrow",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "eyebrow",
                "max": 1,
            },
            {
                "label": "Title",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "title",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Subtitle",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "subtitle",
            },
            {
                "label": "Bottom",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "bottom",
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
