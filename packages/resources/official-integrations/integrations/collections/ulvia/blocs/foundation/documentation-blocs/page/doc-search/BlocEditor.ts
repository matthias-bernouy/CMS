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
                                "label": "Default",
                                "value": "default",
                            },
                            {
                                "label": "Minimal",
                                "value": "minimal",
                            },
                            {
                                "label": "Card",
                                "value": "card",
                            },
                        ],
                        "defaultValue": "default",
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
                    {
                        "type": "segmented",
                        "label": "Show ⌘K shortcut",
                        "attribute": "shortcut",
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
                "label": "Placeholder",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "placeholder",
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
