import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

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
                        "label": "Vertical spacing",
                        "attribute": "spacing",
                        "defaultValue": "default",
                        "options": [
                            {
                                "label": "None",
                                "value": "none",
                            },
                            {
                                "label": "Small",
                                "value": "sm",
                            },
                            {
                                "label": "Default",
                                "value": "default",
                            },
                            {
                                "label": "Large",
                                "value": "lg",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Inset",
                        "attribute": "inset",
                        "defaultValue": "none",
                        "options": [
                            {
                                "label": "Full",
                                "value": "none",
                            },
                            {
                                "label": "Small",
                                "value": "sm",
                            },
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
                    {
                        "type": "segmented",
                        "label": "Thickness",
                        "attribute": "thickness",
                        "defaultValue": "default",
                        "options": [
                            {
                                "label": "Thin",
                                "value": "default",
                            },
                            {
                                "label": "Thick",
                                "value": "thick",
                            },
                        ],
                    },
                ],
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
