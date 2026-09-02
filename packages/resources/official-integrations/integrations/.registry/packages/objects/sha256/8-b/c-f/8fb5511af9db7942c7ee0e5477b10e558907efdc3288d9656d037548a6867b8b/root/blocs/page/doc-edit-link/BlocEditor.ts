import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Link",
                "settings": [
                    {
                        "type": "select",
                        "label": "Provider",
                        "attribute": "provider",
                        "options": [
                            {
                                "label": "GitHub",
                                "value": "github",
                            },
                            {
                                "label": "GitLab",
                                "value": "gitlab",
                            },
                            {
                                "label": "Bitbucket",
                                "value": "bitbucket",
                            },
                            {
                                "label": "Generic",
                                "value": "generic",
                            },
                        ],
                        "defaultValue": "github",
                    },
                    {
                        "type": "page-link",
                        "label": "Edit URL",
                        "attribute": "href",
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
