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
                "label": "Style",
                "settings": [
                    {
                        "type": "select",
                        "label": "Language",
                        "attribute": "language",
                        "options": [
                            {
                                "label": "Plain",
                                "value": "plain",
                            },
                            {
                                "label": "TypeScript",
                                "value": "ts",
                            },
                            {
                                "label": "JavaScript",
                                "value": "js",
                            },
                            {
                                "label": "TSX",
                                "value": "tsx",
                            },
                            {
                                "label": "JSX",
                                "value": "jsx",
                            },
                            {
                                "label": "HTML",
                                "value": "html",
                            },
                            {
                                "label": "CSS",
                                "value": "css",
                            },
                            {
                                "label": "JSON",
                                "value": "json",
                            },
                            {
                                "label": "Bash",
                                "value": "bash",
                            },
                            {
                                "label": "Python",
                                "value": "python",
                            },
                            {
                                "label": "Go",
                                "value": "go",
                            },
                            {
                                "label": "Rust",
                                "value": "rust",
                            },
                            {
                                "label": "SQL",
                                "value": "sql",
                            },
                        ],
                        "defaultValue": "plain",
                    },
                    {
                        "type": "segmented",
                        "label": "Theme",
                        "attribute": "theme",
                        "defaultValue": "dark",
                        "options": [
                            {
                                "label": "Dark",
                                "value": "dark",
                            },
                            {
                                "label": "Light",
                                "value": "light",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Line numbers",
                        "attribute": "line-numbers",
                        "options": [
                            {
                                "label": "Off",
                                "value": "false",
                            },
                            {
                                "label": "On",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "false",
                    },
                    {
                        "type": "segmented",
                        "label": "Wrap lines",
                        "attribute": "wrap",
                        "options": [
                            {
                                "label": "Off",
                                "value": "false",
                            },
                            {
                                "label": "On",
                                "value": "true",
                            },
                        ],
                        "defaultValue": "false",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Filename",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "filename",
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
