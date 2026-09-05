import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

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
                                "label": "Default",
                                "value": "default",
                            },
                            {
                                "label": "Bordered",
                                "value": "bordered",
                            },
                            {
                                "label": "Separated",
                                "value": "separated",
                            },
                            {
                                "label": "Ghost",
                                "value": "ghost",
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
                        ],
                        "defaultValue": "md",
                    },
                    {
                        "type": "select",
                        "label": "Toggle icon",
                        "attribute": "icon",
                        "options": [
                            {
                                "label": "Chevron",
                                "value": "chevron",
                            },
                            {
                                "label": "Plus / minus",
                                "value": "plus",
                            },
                            {
                                "label": "Caret",
                                "value": "caret",
                            },
                            {
                                "label": "None",
                                "value": "none",
                            },
                        ],
                        "defaultValue": "chevron",
                    },
                    {
                        "type": "segmented",
                        "label": "Icon position",
                        "attribute": "icon-position",
                        "defaultValue": "right",
                        "options": [
                            {
                                "label": "Left",
                                "value": "left",
                            },
                            {
                                "label": "Right",
                                "value": "right",
                            },
                        ],
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Behavior",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Open mode",
                        "attribute": "mode",
                        "defaultValue": "single",
                        "options": [
                            {
                                "label": "Single (close others)",
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
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Title",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "title",
                "min": 1,
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
