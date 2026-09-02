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
                        "label": "Level",
                        "attribute": "level",
                        "defaultValue": "2",
                        "options": [
                            {
                                "label": "H1",
                                "value": "1",
                            },
                            {
                                "label": "H2",
                                "value": "2",
                            },
                            {
                                "label": "H3",
                                "value": "3",
                            },
                            {
                                "label": "H4",
                                "value": "4",
                            },
                            {
                                "label": "H5",
                                "value": "5",
                            },
                            {
                                "label": "H6",
                                "value": "6",
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
