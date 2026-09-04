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
                        "label": "Color theme",
                        "attribute": "theme",
                        "defaultValue": "system",
                        "options": [
                            {
                                "label": "System",
                                "value": "system",
                            },
                            {
                                "label": "Light",
                                "value": "light",
                            },
                            {
                                "label": "Dark",
                                "value": "dark",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Content width",
                        "attribute": "content-width",
                        "defaultValue": "article",
                        "options": [
                            {
                                "label": "Article",
                                "value": "article",
                            },
                            {
                                "label": "Wide",
                                "value": "wide",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Search",
                        "attribute": "search",
                        "defaultValue": "true",
                        "options": [
                            {
                                "label": "Show",
                                "value": "true",
                            },
                            {
                                "label": "Hide",
                                "value": "false",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Page outline",
                        "attribute": "toc",
                        "defaultValue": "true",
                        "options": [
                            {
                                "label": "Show",
                                "value": "true",
                            },
                            {
                                "label": "Hide",
                                "value": "false",
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
                "label": "Brand",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "brand",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Top",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "top",
            },
            {
                "label": "Actions",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "actions",
            },
            {
                "label": "Sidebar",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "sidebar",
                "min": 1,
            },
            {
                "label": "Content",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "min": 1,
            },
            {
                "label": "Page aside",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "aside",
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
