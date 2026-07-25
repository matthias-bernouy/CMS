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
                                "label": "Info",
                                "value": "info",
                            },
                            {
                                "label": "Tip",
                                "value": "tip",
                            },
                            {
                                "label": "Warning",
                                "value": "warning",
                            },
                            {
                                "label": "Danger",
                                "value": "danger",
                            },
                            {
                                "label": "Note",
                                "value": "note",
                            },
                        ],
                        "defaultValue": "info",
                    },
                    {
                        "type": "select",
                        "label": "Icon",
                        "attribute": "icon",
                        "options": [
                            {
                                "label": "Auto (from variant)",
                                "value": "auto",
                            },
                            {
                                "label": "Custom",
                                "value": "custom",
                            },
                            {
                                "label": "None",
                                "value": "none",
                            },
                        ],
                        "defaultValue": "auto",
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
                "max": 1,
            },
            {
                "label": "Content",
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
