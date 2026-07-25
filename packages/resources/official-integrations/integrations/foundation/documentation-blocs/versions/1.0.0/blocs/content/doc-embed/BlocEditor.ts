import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Embed",
                "settings": [
                    {
                        "type": "select",
                        "label": "Provider",
                        "attribute": "provider",
                        "options": [
                            {
                                "label": "Auto detect",
                                "value": "auto",
                            },
                            {
                                "label": "YouTube",
                                "value": "youtube",
                            },
                            {
                                "label": "Vimeo",
                                "value": "vimeo",
                            },
                            {
                                "label": "CodePen",
                                "value": "codepen",
                            },
                            {
                                "label": "Figma",
                                "value": "figma",
                            },
                            {
                                "label": "Generic iframe",
                                "value": "generic",
                            },
                        ],
                        "defaultValue": "auto",
                    },
                    {
                        "type": "select",
                        "label": "Aspect ratio",
                        "attribute": "ratio",
                        "options": [
                            {
                                "label": "16 / 9",
                                "value": "16/9",
                            },
                            {
                                "label": "4 / 3",
                                "value": "4/3",
                            },
                            {
                                "label": "1 / 1",
                                "value": "1/1",
                            },
                            {
                                "label": "3 / 4",
                                "value": "3/4",
                            },
                        ],
                        "defaultValue": "16/9",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Src",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "src",
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
