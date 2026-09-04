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
                        "placeholder": "file",
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
                    {
                        "type": "segmented",
                        "label": "Multiple files",
                        "attribute": "multiple",
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
                "label": "Style",
                "settings": [
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
                                "value": "",
                            },
                            {
                                "label": "Large",
                                "value": "lg",
                            },
                        ],
                        "defaultValue": "",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Count constraints",
                "settings": [
                    {
                        "type": "text",
                        "label": "Minimum files",
                        "attribute": "min",
                        "placeholder": "0",
                    },
                    {
                        "type": "text",
                        "label": "Maximum files",
                        "attribute": "max",
                        "placeholder": "—",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Capture",
                "settings": [
                    {
                        "type": "select",
                        "label": "Camera capture",
                        "attribute": "capture",
                        "options": [
                            {
                                "label": "Off",
                                "value": "",
                            },
                            {
                                "label": "Front camera",
                                "value": "user",
                            },
                            {
                                "label": "Back camera",
                                "value": "environment",
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
                "label": "Prompt",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "min": 1,
                "max": 1,
            },
            {
                "label": "Hint",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "hint",
                "max": 1,
            },
            {
                "label": "Accept",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "accept",
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
