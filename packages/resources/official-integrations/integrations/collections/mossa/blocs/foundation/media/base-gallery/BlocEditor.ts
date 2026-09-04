import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

export class BlocEditor extends Editor {
    // -- Generated from legacy editor metadata --

    protected override settings(): SettingSection[] {
        return [
            {
                "kind": "self",
                "label": "Layout",
                "settings": [
                    {
                        "type": "select",
                        "label": "Column min width",
                        "attribute": "col-min",
                        "options": [
                            {
                                "label": "Small (160px)",
                                "value": "sm",
                            },
                            {
                                "label": "Medium (220px)",
                                "value": "md",
                            },
                            {
                                "label": "Large (280px)",
                                "value": "lg",
                            },
                            {
                                "label": "Extra large (360px)",
                                "value": "xl",
                            },
                        ],
                        "defaultValue": "md",
                    },
                    {
                        "type": "select",
                        "label": "Column max width",
                        "attribute": "col-max",
                        "options": [
                            {
                                "label": "Fill (1fr)",
                                "value": "",
                            },
                            {
                                "label": "Small (240px)",
                                "value": "sm",
                            },
                            {
                                "label": "Medium (320px)",
                                "value": "md",
                            },
                            {
                                "label": "Large (420px)",
                                "value": "lg",
                            },
                            {
                                "label": "Extra large (520px)",
                                "value": "xl",
                            },
                        ],
                        "defaultValue": "",
                    },
                    {
                        "type": "select",
                        "label": "Gap",
                        "attribute": "gap",
                        "options": [
                            {
                                "label": "Extra small",
                                "value": "xs",
                            },
                            {
                                "label": "Small",
                                "value": "sm",
                            },
                            {
                                "label": "Medium",
                                "value": "md",
                            },
                            {
                                "label": "Large",
                                "value": "lg",
                            },
                        ],
                        "defaultValue": "md",
                    },
                    {
                        "type": "select",
                        "label": "Image ratio",
                        "attribute": "ratio",
                        "options": [
                            {
                                "label": "1 / 1",
                                "value": "1/1",
                            },
                            {
                                "label": "4 / 3",
                                "value": "4/3",
                            },
                            {
                                "label": "3 / 2",
                                "value": "3/2",
                            },
                            {
                                "label": "16 / 9",
                                "value": "16/9",
                            },
                            {
                                "label": "3 / 4",
                                "value": "3/4",
                            },
                            {
                                "label": "Auto",
                                "value": "auto",
                            },
                        ],
                        "defaultValue": "1/1",
                    },
                    {
                        "type": "segmented",
                        "label": "Layout",
                        "attribute": "layout",
                        "defaultValue": "grid",
                        "options": [
                            {
                                "label": "Grid",
                                "value": "grid",
                            },
                            {
                                "label": "Masonry",
                                "value": "masonry",
                            },
                        ],
                    },
                    {
                        "type": "segmented",
                        "label": "Shape",
                        "attribute": "shape",
                        "defaultValue": "rounded",
                        "options": [
                            {
                                "label": "Square",
                                "value": "square",
                            },
                            {
                                "label": "Rounded",
                                "value": "rounded",
                            },
                            {
                                "label": "Pill",
                                "value": "pill",
                            },
                        ],
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Behavior",
                "settings": [
                    {
                        "type": "segmented",
                        "label": "Lightbox on click",
                        "attribute": "lightbox",
                        "defaultValue": "on",
                        "options": [
                            {
                                "label": "On",
                                "value": "on",
                            },
                            {
                                "label": "Off",
                                "value": "off",
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
                "label": "Label",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "label",
                "min": 1,
            },
        ];
    }
    // -- End generated legacy editor metadata --

    private _observer?: MutationObserver;

    constructor(target: HTMLElement) {
        super(target);
    }

    override mountEditor(): void {
        this._refresh();
        this._observer = new MutationObserver(() => this._refresh());
        this._observer.observe(this.target, { childList: true });
    }

    override unmountEditor(): void {
        this._observer?.disconnect();
        this._observer = undefined;
    }

    private _refresh = () => {
        const count = this.target.querySelectorAll(":scope > img").length;
        this.target.setAttribute("data-count", String(count));
        this.target.toggleAttribute("data-empty", count === 0);
    };
}

registerEditor({ editor: BlocEditor });
