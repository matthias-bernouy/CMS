import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Field",
                "settings": [
                    {
                        "type": "text",
                        "label": "Name",
                        "attribute": "name",
                        "placeholder": "choice",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "State",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Required",
                        "attribute": "required",
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
                ],
            },
            {
                "kind": "self",
                "label": "Layout",
                "settings": [
                    {
                        "type": "select",
                        "label": "Spacing",
                        "attribute": "gap",
                        "options": [
                            {
                                "label": "Small",
                                "value": "sm",
                            },
                            {
                                "label": "Medium",
                                "value": "",
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
                        "label": "Direction",
                        "attribute": "layout",
                        "options": [
                            {
                                "label": "Stack",
                                "value": "",
                            },
                            {
                                "label": "Inline",
                                "value": "inline",
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
                "label": "Options",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "min": 1,
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
