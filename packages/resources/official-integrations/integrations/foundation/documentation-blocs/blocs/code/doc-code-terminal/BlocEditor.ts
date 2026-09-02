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
                        "type": "textarea",
                        "label": "Commands",
                        "attribute": "commands",
                    },
                    {
                        "type": "select",
                        "label": "Prompt",
                        "attribute": "prompt",
                        "options": [
                            {
                                "label": "Dollar ($)",
                                "value": "dollar",
                            },
                            {
                                "label": "Hash (#)",
                                "value": "hash",
                            },
                            {
                                "label": "Arrow (>)",
                                "value": "arrow",
                            },
                            {
                                "label": "None",
                                "value": "none",
                            },
                        ],
                        "defaultValue": "dollar",
                    },
                    {
                        "type": "select",
                        "label": "Window style",
                        "attribute": "os",
                        "options": [
                            {
                                "label": "macOS",
                                "value": "macos",
                            },
                            {
                                "label": "Linux",
                                "value": "linux",
                            },
                            {
                                "label": "Windows",
                                "value": "windows",
                            },
                        ],
                        "defaultValue": "macos",
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
