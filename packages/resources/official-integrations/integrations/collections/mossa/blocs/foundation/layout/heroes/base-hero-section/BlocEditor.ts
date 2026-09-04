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
                        "type": "select",
                        "label": "Theme",
                        "attribute": "theme",
                        "options": [
                            {
                                "label": "Light",
                                "value": "light",
                            },
                            {
                                "label": "Soft accent",
                                "value": "soft",
                            },
                            {
                                "label": "Dark",
                                "value": "dark",
                            },
                        ],
                        "defaultValue": "light",
                    },
                    {
                        "type": "select",
                        "label": "Image ratio",
                        "attribute": "ratio",
                        "options": [
                            {
                                "label": "16 / 9",
                                "value": "16/9",
                            },
                            {
                                "label": "4 / 3",
                                "value": "4/3",
                            },
                            {
                                "label": "3 / 2",
                                "value": "3/2",
                            },
                            {
                                "label": "1 / 1",
                                "value": "1/1",
                            },
                            {
                                "label": "21 / 9",
                                "value": "21/9",
                            },
                            {
                                "label": "Original",
                                "value": "original",
                            },
                        ],
                        "defaultValue": "16/9",
                    },
                    {
                        "type": "select",
                        "label": "Density",
                        "attribute": "density",
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
                        "defaultValue": "regular",
                    },
                    {
                        "type": "segmented",
                        "label": "Image side",
                        "attribute": "reverse",
                        "defaultValue": "false",
                        "options": [
                            {
                                "label": "Right",
                                "value": "false",
                            },
                            {
                                "label": "Left",
                                "value": "true",
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
                "min": 1,
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
                "max": 1,
            },
            {
                "label": "Description",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "description",
                "min": 1,
            },
            {
                "label": "Actions",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "actions",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Hero image",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["image"],
                    },
                ],
                "slot": "image",
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
