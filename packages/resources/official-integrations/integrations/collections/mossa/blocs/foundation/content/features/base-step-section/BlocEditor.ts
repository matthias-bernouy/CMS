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
                        "label": "Number shape",
                        "attribute": "number-shape",
                        "defaultValue": "square",
                        "options": [
                            {
                                "label": "Square",
                                "value": "square",
                            },
                            {
                                "label": "Circle",
                                "value": "circle",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Accent color",
                        "attribute": "accent",
                        "defaultValue": "primary",
                        "options": [
                            {
                                "label": "Primary (orange)",
                                "value": "primary",
                            },
                            {
                                "label": "Lime",
                                "value": "lime",
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
                "label": "Number",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "number",
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
                "label": "Body",
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
