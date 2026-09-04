import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

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
            {
                "kind": "self",
                "label": "Behavior",
                "settings": [
                    {
                        "type": "text",
                        "label": "Placeholder",
                        "attribute": "placeholder",
                        "placeholder": "Search a racket by brand or model…",
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
