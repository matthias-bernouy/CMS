import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Endpoint",
                "settings": [
                    {
                        "type": "select",
                        "label": "HTTP method",
                        "attribute": "method",
                        "options": [
                            {
                                "label": "GET",
                                "value": "GET",
                            },
                            {
                                "label": "POST",
                                "value": "POST",
                            },
                            {
                                "label": "PUT",
                                "value": "PUT",
                            },
                            {
                                "label": "PATCH",
                                "value": "PATCH",
                            },
                            {
                                "label": "DELETE",
                                "value": "DELETE",
                            },
                            {
                                "label": "OPTIONS",
                                "value": "OPTIONS",
                            },
                            {
                                "label": "HEAD",
                                "value": "HEAD",
                            },
                        ],
                        "defaultValue": "GET",
                    },
                    {
                        "type": "segmented",
                        "label": "Deprecated",
                        "attribute": "deprecated",
                        "options": [
                            {
                                "label": "No",
                                "value": "",
                            },
                            {
                                "label": "Yes",
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
                "label": "Path",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "path",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Description",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "description",
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
