import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Style",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Variant",
                        "attribute": "variant",
                        "defaultValue": "default",
                        "options": [
                            {
                                "label": "Default",
                                "value": "default",
                            },
                            {
                                "label": "Accent border",
                                "value": "accent",
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
                "max": 1,
            },
            {
                "label": "Icon",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "icon",
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
                "label": "Description",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "description",
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
