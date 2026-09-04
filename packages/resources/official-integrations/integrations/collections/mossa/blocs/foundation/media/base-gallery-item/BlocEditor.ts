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
                        "label": "Ratio",
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
                "label": "Label",
                "settings": [
                    {
                        "type": "select",
                        "label": "Position",
                        "attribute": "label-position",
                        "options": [
                            {
                                "label": "Overlay bottom",
                                "value": "bottom",
                            },
                            {
                                "label": "Overlay top",
                                "value": "top",
                            },
                            {
                                "label": "Below image",
                                "value": "below",
                            },
                        ],
                        "defaultValue": "bottom",
                    },
                    {
                        "type": "segmented",
                        "label": "Visibility",
                        "attribute": "label-visibility",
                        "defaultValue": "always",
                        "options": [
                            {
                                "label": "Always",
                                "value": "always",
                            },
                            {
                                "label": "On hover",
                                "value": "hover",
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
                "label": "Image",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["image"],
                    },
                ],
                "slot": "image",
                "min": 1,
                "max": 1,
            },
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

    private _observer?: MutationObserver;

    constructor(target: HTMLElement) {
        super(target);
    }

    override mountEditor(): void {
        this._refresh();
        this._observer = new MutationObserver(() => this._refresh());
        this._observer.observe(this.target, { childList: true, subtree: true, characterData: true });
    }

    override unmountEditor(): void {
        this._observer?.disconnect();
        this._observer = undefined;
    }

    private _refresh = () => {
        const host = this.target;
        const label = host.querySelector(':scope > [slot="label"]');
        const hasLabel = !!(label?.textContent || "").trim();
        host.toggleAttribute("no-label", !hasLabel);
    };
}

registerEditor({ editor: BlocEditor });
