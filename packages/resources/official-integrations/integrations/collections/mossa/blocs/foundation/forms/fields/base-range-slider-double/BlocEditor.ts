import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Range",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Handles",
                        "attribute": "mode",
                        "defaultValue": "range",
                        "options": [
                            { "label": "Range", "value": "range" },
                            { "label": "Maximum", "value": "max" },
                        ],
                    },
                    {
                        "type": "text",
                        "label": "Min value",
                        "attribute": "min",
                        "defaultValue": "0",
                        "help": "Min 0, max 10000",
                    },
                    {
                        "type": "text",
                        "label": "Max value",
                        "attribute": "max",
                        "defaultValue": "300",
                        "help": "Min 0, max 10000",
                    },
                    {
                        "type": "text",
                        "label": "Step",
                        "attribute": "step",
                        "defaultValue": "1",
                        "help": "Min 1, max 100",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Default values",
                "settings": [
                    {
                        "type": "text",
                        "label": "Default min",
                        "attribute": "value-min",
                        "defaultValue": "0",
                        "help": "Min 0, max 10000",
                    },
                    {
                        "type": "text",
                        "label": "Default max",
                        "attribute": "value-max",
                        "defaultValue": "300",
                        "help": "Min 0, max 10000",
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Label",
                "settings": [
                    {
                        "type": "text",
                        "label": "Label",
                        "attribute": "label",
                        "placeholder": "Price",
                    },
                    {
                        "type": "text",
                        "label": "Unit",
                        "attribute": "unit",
                        "placeholder": "€",
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
