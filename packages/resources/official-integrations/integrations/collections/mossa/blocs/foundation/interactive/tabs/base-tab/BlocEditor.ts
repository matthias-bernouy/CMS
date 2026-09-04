import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Tab",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Active by default",
                        "attribute": "active",
                        "options": [
                            {
                                "label": "False",
                                "value": "",
                            },
                            {
                                "label": "True",
                                "value": "true",
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
            {
                "label": "Content",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
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
        return this.target.shadowRoot?.querySelector<HTMLElement>(".tab-label") ?? null;
    }
}

registerEditor({ editor: BlocEditor });
