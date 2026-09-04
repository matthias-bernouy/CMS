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
                        "defaultValue": "secondary",
                        "options": [
                            {
                                "label": "Neutral",
                                "value": "default",
                            },
                            {
                                "label": "Orange",
                                "value": "secondary",
                            },
                            {
                                "label": "Lime",
                                "value": "primary",
                            },
                        ],
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
                "label": "Lead",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "lead",
            },
            {
                "label": "Actions",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "actions",
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
