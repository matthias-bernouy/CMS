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
                        "label": "Format",
                        "attribute": "format",
                        "options": [
                            {
                                "label": "Relative (3 days ago)",
                                "value": "relative",
                            },
                            {
                                "label": "Absolute (April 16, 2026)",
                                "value": "absolute",
                            },
                            {
                                "label": "Both",
                                "value": "both",
                            },
                        ],
                        "defaultValue": "relative",
                    },
                    {
                        "type": "select",
                        "label": "Locale",
                        "attribute": "locale",
                        "options": [
                            {
                                "label": "English",
                                "value": "en",
                            },
                            {
                                "label": "French",
                                "value": "fr",
                            },
                            {
                                "label": "German",
                                "value": "de",
                            },
                            {
                                "label": "Spanish",
                                "value": "es",
                            },
                        ],
                        "defaultValue": "en",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "label",
                "max": 1,
            },
            {
                "label": "Date",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "date",
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
