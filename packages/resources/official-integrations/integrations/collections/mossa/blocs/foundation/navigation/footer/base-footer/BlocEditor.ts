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
                        "label": "Variant",
                        "attribute": "variant",
                        "options": [
                            {
                                "label": "Background",
                                "value": "background",
                            },
                            {
                                "label": "Surface",
                                "value": "surface",
                            },
                            {
                                "label": "Primary",
                                "value": "primary",
                            },
                            {
                                "label": "Secondary",
                                "value": "secondary",
                            },
                        ],
                        "defaultValue": "background",
                    },
                    {
                        "type": "select",
                        "label": "Max width",
                        "attribute": "width",
                        "options": [
                            {
                                "label": "Medium (960px)",
                                "value": "md",
                            },
                            {
                                "label": "Large (1200px)",
                                "value": "lg",
                            },
                            {
                                "label": "Extra large (1440px)",
                                "value": "xl",
                            },
                            {
                                "label": "Full width",
                                "value": "full",
                            },
                        ],
                        "defaultValue": "lg",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
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
                "label": "Copyright",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "copyright",
                "max": 1,
            },
            {
                "label": "Legal",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "legal",
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
