import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Layout",
                "settings": [
                    {
                        "type": "select",
                        "label": "Separator",
                        "attribute": "separator",
                        "options": [
                            {
                                "label": "None",
                                "value": "none",
                            },
                            {
                                "label": "Dot",
                                "value": "dot",
                            },
                            {
                                "label": "Pipe",
                                "value": "pipe",
                            },
                        ],
                        "defaultValue": "none",
                    },
                    {
                        "type": "select",
                        "label": "Theme",
                        "attribute": "theme",
                        "options": [
                            {
                                "label": "Light",
                                "value": "light",
                            },
                            {
                                "label": "Dark",
                                "value": "dark",
                            },
                        ],
                        "defaultValue": "light",
                    },
                    {
                        "type": "segmented",
                        "label": "Alignment",
                        "attribute": "align",
                        "defaultValue": "left",
                        "options": [
                            {
                                "label": "Left",
                                "value": "left",
                            },
                            {
                                "label": "Center",
                                "value": "center",
                            },
                            {
                                "label": "Right",
                                "value": "right",
                            },
                            {
                                "label": "Spread",
                                "value": "between",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Size",
                        "attribute": "size",
                        "defaultValue": "md",
                        "options": [
                            {
                                "label": "S",
                                "value": "sm",
                            },
                            {
                                "label": "M",
                                "value": "md",
                            },
                            {
                                "label": "L",
                                "value": "lg",
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
                "label": "Author",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "author",
                "max": 1,
            },
            {
                "label": "Date",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "date",
                "max": 1,
            },
            {
                "label": "Badges",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "badges",
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
