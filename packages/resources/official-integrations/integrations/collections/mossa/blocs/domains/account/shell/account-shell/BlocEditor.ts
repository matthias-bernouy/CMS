import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Layout",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Sidebar width",
                        "attribute": "sidebar-width",
                        "defaultValue": "md",
                        "options": [
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
                        "label": "Gap between sidebar and content",
                        "attribute": "gap",
                        "defaultValue": "md",
                        "options": [
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
                            {
                                "label": "Extra large",
                                "value": "xl",
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
                "label": "Sidebar",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "sidebar",
                "min": 1,
            },
            {
                "label": "Main",
                "accepts": [
                    {
                        "kind": "any-component",
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
