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
                                "label": "Full-bleed",
                                "value": "default",
                            },
                            {
                                "label": "Card (rounded)",
                                "value": "card",
                            },
                            {
                                "label": "Inline (slim)",
                                "value": "inline",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Color",
                        "attribute": "color",
                        "defaultValue": "secondary",
                        "options": [
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
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Icon",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["svg"],
                    },
                ],
                "slot": "icon",
                "max": 1,
            },
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
                "label": "Text",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "text",
            },
            {
                "label": "Stats",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "stats",
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
