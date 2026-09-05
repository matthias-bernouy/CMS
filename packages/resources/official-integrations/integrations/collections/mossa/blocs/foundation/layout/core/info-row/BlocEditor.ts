import {
    Editor,
    registerEditor,
    type SettingSection,
    type ContentSlot,
    type TextCapability,
} from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }

    // -- Generated editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Style",
                "settings": [
                    {
                        "type": "select",
                        "label": "Value style",
                        "attribute": "variant",
                        "options": [
                            {
                                "label": "Regular",
                                "value": "",
                            },
                            {
                                "label": "Monospace (IDs, codes)",
                                "value": "mono",
                            },
                        ],
                        "defaultValue": "",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Icon",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "icon",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "label",
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
