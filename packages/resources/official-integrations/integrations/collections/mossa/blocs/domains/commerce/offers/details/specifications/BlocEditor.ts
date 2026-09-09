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
                        "type": "segmented",
                        "label": "Variant",
                        "attribute": "variant",
                        "defaultValue": "",
                        "options": [
                            {
                                "label": "Card",
                                "value": "",
                            },
                            {
                                "label": "Flat (no card)",
                                "value": "flat",
                            },
                            {
                                "label": "Highlighted card",
                                "value": "highlight",
                            },
                            {
                                "label": "Two-column grid",
                                "value": "grid",
                            },
                            {
                                "label": "Two-column grid (flat)",
                                "value": "grid-flat",
                            },
                        ],
                    },
                    {
                        "type": "select",
                        "label": "Tone",
                        "attribute": "tone",
                        "defaultValue": "primary",
                        "options": [
                            { "label": "Primary", "value": "primary" },
                            { "label": "Secondary", "value": "secondary" },
                            { "label": "Neutral", "value": "neutral" },
                            { "label": "Success", "value": "success" },
                            { "label": "Warning", "value": "warning" },
                            { "label": "Danger", "value": "danger" },
                            { "label": "Info", "value": "info" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Rows",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
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
