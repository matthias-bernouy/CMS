import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "label": "Accessible label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "accessible-label",
                "min": 1,
                "max": 1,
            },
            {
                "kind": "self",
                "label": "Style",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Size",
                        "attribute": "size",
                        "defaultValue": "md",
                        "options": [
                            {
                                "label": "Medium",
                                "value": "md",
                            },
                            {
                                "label": "Large",
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
                "label": "Placeholder",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "placeholder",
                "max": 1,
            },
            {
                "label": "Clear label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "clear-label",
                "min": 1,
                "max": 1,
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
