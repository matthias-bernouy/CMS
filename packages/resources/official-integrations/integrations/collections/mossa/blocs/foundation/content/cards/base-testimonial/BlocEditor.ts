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
                                "label": "Card",
                                "value": "card",
                            },
                            {
                                "label": "Quote",
                                "value": "quote",
                            },
                            {
                                "label": "Minimal",
                                "value": "minimal",
                            },
                        ],
                        "defaultValue": "card",
                    },
                    {
                        "type": "select",
                        "label": "Rating",
                        "attribute": "rating",
                        "options": [
                            {
                                "label": "None",
                                "value": "0",
                            },
                            {
                                "label": "1 / 5",
                                "value": "1",
                            },
                            {
                                "label": "2 / 5",
                                "value": "2",
                            },
                            {
                                "label": "3 / 5",
                                "value": "3",
                            },
                            {
                                "label": "4 / 5",
                                "value": "4",
                            },
                            {
                                "label": "5 / 5",
                                "value": "5",
                            },
                        ],
                        "defaultValue": "5",
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
                        "label": "Show quote mark",
                        "attribute": "show-mark",
                        "defaultValue": "true",
                        "options": [
                            {
                                "label": "True",
                                "value": "true",
                            },
                            {
                                "label": "False",
                                "value": "false",
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
                "label": "Quote",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "quote",
                "min": 1,
            },
            {
                "label": "Avatar",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["image"],
                    },
                ],
                "slot": "avatar",
                "max": 1,
            },
            {
                "label": "Name",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "name",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Role",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "role",
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
