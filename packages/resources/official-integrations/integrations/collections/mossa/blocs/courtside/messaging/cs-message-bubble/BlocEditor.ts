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
                "label": "Side",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Author",
                        "attribute": "side",
                        "defaultValue": "them",
                        "options": [
                            {
                                "label": "Them (left)",
                                "value": "them",
                            },
                            {
                                "label": "Me (right)",
                                "value": "me",
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
                "label": "Author",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "author",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Time",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "time",
                "min": 1,
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
