import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Grade",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Grade",
                        "attribute": "grade",
                        "defaultValue": "ace",
                        "options": [
                            {
                                "label": "Ace (excellent)",
                                "value": "ace",
                            },
                            {
                                "label": "Break (good)",
                                "value": "break",
                            },
                            {
                                "label": "Coup droit (worn)",
                                "value": "coup-droit",
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
    // -- End generated legacy editor metadata --

    constructor(target: HTMLElement) {
        super(target);
    }
    override mountEditor(): void {}
    override unmountEditor(): void {}
}

registerEditor({ editor: BlocEditor });
