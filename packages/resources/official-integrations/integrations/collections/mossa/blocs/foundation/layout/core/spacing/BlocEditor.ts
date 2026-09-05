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
                        "defaultValue": "md",
                        "options": [
                            {
                                "label": "XS",
                                "value": "xs",
                            },
                            {
                                "label": "SM",
                                "value": "sm",
                            },
                            {
                                "label": "MD",
                                "value": "md",
                            },
                            {
                                "label": "LG",
                                "value": "lg",
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
