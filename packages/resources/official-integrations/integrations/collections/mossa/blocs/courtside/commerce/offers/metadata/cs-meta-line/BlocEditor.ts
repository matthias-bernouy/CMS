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

    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Style",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Size",
                        "attribute": "size",
                        "defaultValue": "",
                        "options": [
                            {
                                "label": "Small",
                                "value": "sm",
                            },
                            {
                                "label": "Default",
                                "value": "",
                            },
                            {
                                "label": "Medium",
                                "value": "md",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Tone",
                        "attribute": "tone",
                        "defaultValue": "",
                        "options": [
                            {
                                "label": "Muted",
                                "value": "",
                            },
                            {
                                "label": "Body",
                                "value": "default",
                            },
                            {
                                "label": "Strong",
                                "value": "strong",
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
                "label": "Icône",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["svg"],
                    },
                ],
                "slot": "icon",
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
