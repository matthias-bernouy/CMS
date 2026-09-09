import {
    Editor,
    registerEditor,
    type ContentSlot,
    type SettingSection,
    type TextCapability,
} from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override textCapability(): TextCapability {
        return { format: "text", dynamic: true };
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Variant",
                        attribute: "variant",
                        defaultValue: "default",
                        options: [
                            { label: "Card", value: "default" },
                            { label: "Compact", value: "compact" },
                        ],
                    },
                ],
            },
        ];
    }

    // -- Generated editor metadata --

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Icon",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "icon",
                "min": 1,
                "max": 1,
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
