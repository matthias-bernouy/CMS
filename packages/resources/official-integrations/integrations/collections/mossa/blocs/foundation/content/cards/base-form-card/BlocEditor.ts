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
                        "label": "Tone",
                        "attribute": "tone",
                        "defaultValue": "default",
                        "options": [
                            {
                                "label": "Default",
                                "value": "default",
                            },
                            {
                                "label": "Muted (cream)",
                                "value": "muted",
                            },
                            {
                                "label": "Dark",
                                "value": "dark",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Density",
                        "attribute": "density",
                        "defaultValue": "regular",
                        "options": [
                            {
                                "label": "Dense",
                                "value": "dense",
                            },
                            {
                                "label": "Regular",
                                "value": "regular",
                            },
                            {
                                "label": "Spacious",
                                "value": "spacious",
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
                "label": "Description",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "description",
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
