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
                        "label": "Alignment",
                        "attribute": "align",
                        "defaultValue": "center",
                        "options": [
                            {
                                "label": "Left",
                                "value": "left",
                            },
                            {
                                "label": "Center",
                                "value": "center",
                            },
                            {
                                "label": "Right",
                                "value": "right",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Bordered",
                        "attribute": "bordered",
                        "options": [
                            {
                                "label": "No",
                                "value": "false",
                            },
                            {
                                "label": "Yes",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "false",
                    },
                    {
                        "type": "segmented",
                        "label": "Zoom on click",
                        "attribute": "zoom",
                        "options": [
                            {
                                "label": "Off",
                                "value": "false",
                            },
                            {
                                "label": "On",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "false",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Figure image",
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
            {
                "label": "Caption",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "caption",
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
