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
                                "label": "Background",
                                "value": "background",
                            },
                            {
                                "label": "Surface",
                                "value": "surface",
                            },
                            {
                                "label": "Primary",
                                "value": "primary",
                            },
                            {
                                "label": "Secondary",
                                "value": "secondary",
                            },
                        ],
                        "defaultValue": "background",
                    },
                    {
                        "type": "select",
                        "label": "Border radius",
                        "attribute": "radius",
                        "options": [
                            {
                                "label": "None",
                                "value": "",
                            },
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
                        "defaultValue": "",
                    },
                    {
                        "type": "segmented",
                        "label": "Side",
                        "attribute": "position",
                        "defaultValue": "left",
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
                        "label": "Sticky on scroll",
                        "attribute": "sticky",
                        "options": [
                            {
                                "label": "No",
                                "value": "",
                            },
                            {
                                "label": "Yes",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "",
                    },
                    {
                        "type": "segmented",
                        "label": "Desktop collapse button",
                        "attribute": "collapsible",
                        "options": [
                            {
                                "label": "No",
                                "value": "",
                            },
                            {
                                "label": "Yes",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "",
                    },
                    {
                        "type": "segmented",
                        "label": "Start collapsed",
                        "attribute": "collapsed",
                        "options": [
                            {
                                "label": "No",
                                "value": "",
                            },
                            {
                                "label": "Yes",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Logo",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["image"],
                    },
                ],
                "slot": "brand",
                "max": 1,
            },
            {
                "label": "Body",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "min": 1,
            },
            {
                "label": "Footer",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "footer",
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
