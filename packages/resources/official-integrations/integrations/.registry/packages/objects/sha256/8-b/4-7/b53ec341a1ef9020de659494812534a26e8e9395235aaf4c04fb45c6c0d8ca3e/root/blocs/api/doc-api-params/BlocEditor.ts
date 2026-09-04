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
                        "label": "Kind",
                        "attribute": "kind",
                        "options": [
                            {
                                "label": "Query",
                                "value": "query",
                            },
                            {
                                "label": "Path",
                                "value": "path",
                            },
                            {
                                "label": "Body",
                                "value": "body",
                            },
                            {
                                "label": "Header",
                                "value": "header",
                            },
                            {
                                "label": "Response",
                                "value": "response",
                            },
                        ],
                        "defaultValue": "query",
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
                        "kind": "component",
                        "tag": "doc-api-property",
                    },
                ],
                "slot": "title",
                "max": 1,
            },
            {
                "label": "Properties",
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
}

registerEditor({ editor: BlocEditor });
