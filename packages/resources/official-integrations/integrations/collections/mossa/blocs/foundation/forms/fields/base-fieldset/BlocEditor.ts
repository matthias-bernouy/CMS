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
                                "label": "Bordered",
                                "value": "bordered",
                            },
                            {
                                "label": "Plain",
                                "value": "plain",
                            },
                        ],
                        "defaultValue": "bordered",
                    },
                    {
                        "type": "segmented",
                        "label": "Disabled",
                        "attribute": "disabled",
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
                        "type": "select",
                        "label": "Gap",
                        "attribute": "gap",
                        "defaultValue": "md",
                        "options": [
                            {
                                "label": "None",
                                "value": "",
                            },
                            {
                                "label": "Extra small",
                                "value": "xs",
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
                            {
                                "label": "Extra large",
                                "value": "xl",
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
                "label": "Legend",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "legend",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Fields",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
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
