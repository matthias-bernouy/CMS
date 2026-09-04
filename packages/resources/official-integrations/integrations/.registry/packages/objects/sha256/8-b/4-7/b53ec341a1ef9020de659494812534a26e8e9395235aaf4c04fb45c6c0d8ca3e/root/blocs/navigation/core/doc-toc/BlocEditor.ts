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
                        "label": "Heading levels",
                        "attribute": "levels",
                        "options": [
                            {
                                "label": "H2 only",
                                "value": "h2",
                            },
                            {
                                "label": "H2 and H3",
                                "value": "h2-h3",
                            },
                            {
                                "label": "H2, H3 and H4",
                                "value": "h2-h4",
                            },
                        ],
                        "defaultValue": "h2-h3",
                    },
                    {
                        "type": "segmented",
                        "label": "Sticky",
                        "attribute": "sticky",
                        "options": [
                            {
                                "label": "No",
                                "value": "false",
                            },
                            {
                                "label": "Yes",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "false",
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
