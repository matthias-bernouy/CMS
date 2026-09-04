import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "State",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Checked by default",
                        "attribute": "checked",
                        "options": [
                            {
                                "label": "Off",
                                "value": "",
                            },
                            {
                                "label": "On",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Badge",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Badge color",
                        "attribute": "grade",
                        "defaultValue": "ace",
                        "options": [
                            {
                                "label": "Ace (green)",
                                "value": "ace",
                            },
                            {
                                "label": "Break (orange)",
                                "value": "break",
                            },
                            {
                                "label": "Coup droit (brown)",
                                "value": "coup-droit",
                            },
                        ],
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Value",
                "settings": [
                    {
                        "type": "text",
                        "label": "Value",
                        "attribute": "value",
                        "placeholder": "value",
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
                "min": 1,
                "max": 1,
            },
            {
                "label": "Badge",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "badge",
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
