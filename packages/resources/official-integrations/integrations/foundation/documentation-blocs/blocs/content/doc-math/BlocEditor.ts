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
                        "type": "segmented",
                        "label": "Display",
                        "attribute": "display",
                        "defaultValue": "inline",
                        "options": [
                            {
                                "label": "Inline",
                                "value": "inline",
                            },
                            {
                                "label": "Block",
                                "value": "block",
                            },
                        ],
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
