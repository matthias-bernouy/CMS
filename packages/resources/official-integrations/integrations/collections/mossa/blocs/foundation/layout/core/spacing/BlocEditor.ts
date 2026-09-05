import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Size",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Height",
                        "attribute": "size",
                        "defaultValue": "m",
                        "options": [
                            {
                                "label": "XS",
                                "value": "xs",
                            },
                            {
                                "label": "S",
                                "value": "s",
                            },
                            {
                                "label": "M",
                                "value": "m",
                            },
                            {
                                "label": "L",
                                "value": "l",
                            },
                            {
                                "label": "XL",
                                "value": "xl",
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
