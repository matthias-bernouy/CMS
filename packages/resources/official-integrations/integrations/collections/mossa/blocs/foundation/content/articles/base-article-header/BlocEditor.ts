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
                        "label": "Layout",
                        "attribute": "layout",
                        "options": [
                            {
                                "label": "Hero (image on top)",
                                "value": "hero",
                            },
                            {
                                "label": "Side (image right)",
                                "value": "side",
                            },
                            {
                                "label": "Side (image left)",
                                "value": "side-reverse",
                            },
                            {
                                "label": "Cover (text over image)",
                                "value": "cover",
                            },
                            {
                                "label": "Minimal (no image)",
                                "value": "minimal",
                            },
                        ],
                        "defaultValue": "hero",
                    },
                    {
                        "type": "select",
                        "label": "Max width",
                        "attribute": "width",
                        "options": [
                            {
                                "label": "Small (680)",
                                "value": "sm",
                            },
                            {
                                "label": "Medium (900)",
                                "value": "md",
                            },
                            {
                                "label": "Large (1100)",
                                "value": "lg",
                            },
                            {
                                "label": "Full",
                                "value": "full",
                            },
                        ],
                        "defaultValue": "md",
                    },
                    {
                        "type": "select",
                        "label": "Theme",
                        "attribute": "theme",
                        "options": [
                            {
                                "label": "Light",
                                "value": "light",
                            },
                            {
                                "label": "Dark",
                                "value": "dark",
                            },
                        ],
                        "defaultValue": "light",
                    },
                    {
                        "type": "segmented",
                        "label": "Text align",
                        "attribute": "align",
                        "defaultValue": "left",
                        "options": [
                            {
                                "label": "Left",
                                "value": "left",
                            },
                            {
                                "label": "Center",
                                "value": "center",
                            },
                        ],
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Image",
                "settings": [
                    {
                        "type": "select",
                        "label": "Image ratio",
                        "attribute": "ratio",
                        "options": [
                            {
                                "label": "16 / 9",
                                "value": "16/9",
                            },
                            {
                                "label": "3 / 2",
                                "value": "3/2",
                            },
                            {
                                "label": "4 / 3",
                                "value": "4/3",
                            },
                            {
                                "label": "21 / 9",
                                "value": "21/9",
                            },
                            {
                                "label": "1 / 1",
                                "value": "1/1",
                            },
                        ],
                        "defaultValue": "16/9",
                    },
                    {
                        "type": "select",
                        "label": "Overlay",
                        "attribute": "overlay",
                        "options": [
                            {
                                "label": "None",
                                "value": "none",
                            },
                            {
                                "label": "Dark",
                                "value": "dark",
                            },
                            {
                                "label": "Light",
                                "value": "light",
                            },
                        ],
                        "defaultValue": "none",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Hero image",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["image"],
                    },
                ],
                "slot": "image",
                "max": 1,
            },
            {
                "label": "Eyebrow",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "eyebrow",
                "max": 1,
            },
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
                "label": "Lead",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "lead",
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
        this._observer.observe(this.target, { childList: true, subtree: false });
    }

    override unmountEditor(): void {
        this._observer?.disconnect();
        this._observer = undefined;
    }

    private _refresh = () => {
        const hasImage = !!this.target.querySelector(':scope > [slot="image"]');
        this.target.toggleAttribute("no-image", !hasImage);
    };
}

registerEditor({ editor: BlocEditor });
