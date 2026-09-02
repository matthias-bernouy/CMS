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
                        "label": "Theme",
                        "attribute": "variant",
                        "defaultValue": "light",
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
