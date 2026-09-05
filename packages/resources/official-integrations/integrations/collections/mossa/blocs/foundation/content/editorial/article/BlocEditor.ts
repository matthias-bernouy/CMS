import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Layout",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Width",
                        "attribute": "layout",
                        "defaultValue": "default",
                        "options": [
                            {
                                "label": "Narrow",
                                "value": "narrow",
                            },
                            {
                                "label": "Default",
                                "value": "default",
                            },
                            {
                                "label": "Wide",
                                "value": "wide",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Padding",
                        "attribute": "density",
                        "defaultValue": "regular",
                        "options": [
                            {
                                "label": "Compact",
                                "value": "compact",
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
                    {
                        "type": "segmented",
                        "label": "Cover image",
                        "attribute": "cover-position",
                        "defaultValue": "top",
                        "options": [
                            {
                                "label": "Top",
                                "value": "top",
                            },
                            {
                                "label": "Below header",
                                "value": "below-head",
                            },
                            {
                                "label": "Hidden",
                                "value": "hidden",
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
                "label": "Cover image",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["image"],
                    },
                ],
                "slot": "cover",
                "max": 1,
            },
            {
                "label": "Eyebrow",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "eyebrow",
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
                "label": "Lead",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "lead",
            },
            {
                "label": "Author avatar",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["image"],
                    },
                ],
                "slot": "author-avatar",
                "max": 1,
            },
            {
                "label": "Author Name",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "author-name",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Meta",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "meta",
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
    // -- End generated editor metadata --

    constructor(target: HTMLElement) {
        super(target);
    }
    override mountEditor(): void {}
    override unmountEditor(): void {}
}

registerEditor({ editor: BlocEditor });
