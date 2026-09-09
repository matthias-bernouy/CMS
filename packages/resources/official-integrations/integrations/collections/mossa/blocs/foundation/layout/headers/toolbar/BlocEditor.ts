import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Density",
                        attribute: "density",
                        defaultValue: "regular",
                        options: [
                            { label: "Compact", value: "compact" },
                            { label: "Regular", value: "regular" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Title",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "title",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Meta",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "meta",
                "max": 1,
            },
            {
                "label": "Controls",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "controls",
            },
        ];
    }
    constructor(target: HTMLElement) {
        super(target);
    }
    override mountEditor(): void {}
    override unmountEditor(): void {}
}

registerEditor({ editor: BlocEditor });
