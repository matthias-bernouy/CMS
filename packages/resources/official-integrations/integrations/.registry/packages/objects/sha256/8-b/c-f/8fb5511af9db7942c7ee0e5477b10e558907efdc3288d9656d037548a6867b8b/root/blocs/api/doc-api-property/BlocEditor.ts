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
                        "label": "Required",
                        "attribute": "required",
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
                        "label": "Deprecated",
                        "attribute": "deprecated",
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
                "label": "Type",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "type",
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
