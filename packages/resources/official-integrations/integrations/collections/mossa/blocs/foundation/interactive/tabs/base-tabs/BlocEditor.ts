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
                                "label": "Underline",
                                "value": "underline",
                            },
                            {
                                "label": "Pill",
                                "value": "pill",
                            },
                            {
                                "label": "Segmented",
                                "value": "segmented",
                            },
                        ],
                        "defaultValue": "underline",
                    },
                    {
                        "type": "select",
                        "label": "Size",
                        "attribute": "size",
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
                        "defaultValue": "md",
                    },
                    {
                        "type": "segmented",
                        "label": "Alignement",
                        "attribute": "align",
                        "defaultValue": "left",
                        "options": [
                            {
                                "label": "Left",
                                "value": "left",
                            },
                            {
                                "label": "Center",
                                "value": "center",
                            },
                            {
                                "label": "Stretch",
                                "value": "stretch",
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
                "label": "Label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "label",
                "min": 1,
            },
        ];
    }
    // -- End generated legacy editor metadata --

    constructor(target: HTMLElement) {
        super(target);
    }

    override mountEditor(): void {}
    override unmountEditor(): void {}

    getActionBarAnchor(): HTMLElement | null {
        return this.target.shadowRoot?.querySelector<HTMLElement>(".tablist") ?? null;
    }
}

registerEditor({ editor: BlocEditor });
