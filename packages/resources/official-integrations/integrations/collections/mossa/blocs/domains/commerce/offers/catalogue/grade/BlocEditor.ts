import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Appearance",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Tone",
                        "attribute": "tone",
                        "defaultValue": "success",
                        "options": [
                            {
                                "label": "Success",
                                "value": "success",
                            },
                            {
                                "label": "Accent",
                                "value": "accent",
                            },
                            {
                                "label": "Neutral",
                                "value": "neutral",
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
                "label": "Badge",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "badge",
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
            {
                "label": "Criteria",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "criteria",
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
