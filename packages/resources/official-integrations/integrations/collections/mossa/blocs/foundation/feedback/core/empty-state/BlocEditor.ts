import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Layout",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Variant",
                        "attribute": "variant",
                        "defaultValue": "inline",
                        "options": [
                            {
                                "label": "Inline",
                                "value": "inline",
                            },
                            {
                                "label": "Card",
                                "value": "card",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Size",
                        "attribute": "size",
                        "defaultValue": "md",
                        "options": [
                            {
                                "label": "Medium",
                                "value": "md",
                            },
                            {
                                "label": "Large",
                                "value": "lg",
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
                        "kind": "any-component",
                    },
                ],
                "slot": "icon",
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
                "label": "Description",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "description",
            },
            {
                "label": "Action",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "action",
            },
        ];
    }
    // -- End generated editor metadata --

    constructor(target: HTMLElement) {
        super(target);
    }
    override mountEditor(): void {}
    override unmountEditor(): void {}
}

registerEditor({ editor: BlocEditor });
