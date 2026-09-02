import { Editor, registerEditor, type SettingSection, type TextCapability } from "@bernouy/cms-content/editor";

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
                        "type": "select",
                        "label": "Theme",
                        "attribute": "theme",
                        "options": [
                            {
                                "label": "Default",
                                "value": "default",
                            },
                            {
                                "label": "Dark",
                                "value": "dark",
                            },
                            {
                                "label": "Forest",
                                "value": "forest",
                            },
                            {
                                "label": "Neutral",
                                "value": "neutral",
                            },
                        ],
                        "defaultValue": "default",
                    },
                ],
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
