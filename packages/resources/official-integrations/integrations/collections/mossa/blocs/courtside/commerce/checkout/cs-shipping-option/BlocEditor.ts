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
                        "type": "segmented",
                        "label": "Selected by default",
                        "attribute": "checked",
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
                        "type": "text",
                        "label": "Group name (shared between options)",
                        "attribute": "name",
                        "placeholder": "shipping",
                    },
                    {
                        "type": "text",
                        "label": "Value submitted when selected",
                        "attribute": "value",
                        "placeholder": "mondial-relay",
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
                "min": 1,
                "max": 1,
            },
            {
                "label": "Subtitle",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "subtitle",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Note",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "note",
                "max": 1,
            },
            {
                "label": "Price",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "price",
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
