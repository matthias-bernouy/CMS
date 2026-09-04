import { Editor, registerEditor, type SettingSection, type ContentSlot } from "@bernouy/cms-content/editor";

const AUTO_COLOR_BUCKETS = 8;

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
                        "label": "Variant",
                        "attribute": "variant",
                        "options": [
                            {
                                "label": "Default",
                                "value": "default",
                            },
                            {
                                "label": "Outlined",
                                "value": "outlined",
                            },
                            {
                                "label": "Filled",
                                "value": "filled",
                            },
                            {
                                "label": "Ghost",
                                "value": "ghost",
                            },
                        ],
                        "defaultValue": "default",
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
                        "type": "select",
                        "label": "Size",
                        "attribute": "size",
                        "options": [
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
                        "type": "segmented",
                        "label": "Layout",
                        "attribute": "layout",
                        "defaultValue": "row",
                        "options": [
                            {
                                "label": "Row",
                                "value": "row",
                            },
                            {
                                "label": "Stacked",
                                "value": "stacked",
                            },
                        ],
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Avatar",
                "settings": [
                    {
                        "type": "select",
                        "label": "Color",
                        "attribute": "color",
                        "options": [
                            {
                                "label": "Auto (from name)",
                                "value": "auto",
                            },
                            {
                                "label": "Indigo",
                                "value": "indigo",
                            },
                            {
                                "label": "Sky",
                                "value": "sky",
                            },
                            {
                                "label": "Emerald",
                                "value": "emerald",
                            },
                            {
                                "label": "Amber",
                                "value": "amber",
                            },
                            {
                                "label": "Rose",
                                "value": "rose",
                            },
                            {
                                "label": "Violet",
                                "value": "violet",
                            },
                            {
                                "label": "Pink",
                                "value": "pink",
                            },
                            {
                                "label": "Teal",
                                "value": "teal",
                            },
                            {
                                "label": "Slate",
                                "value": "slate",
                            },
                        ],
                        "defaultValue": "auto",
                    },
                    {
                        "type": "segmented",
                        "label": "Shape",
                        "attribute": "avatar-shape",
                        "defaultValue": "pill",
                        "options": [
                            {
                                "label": "Pill",
                                "value": "pill",
                            },
                            {
                                "label": "Square",
                                "value": "square",
                            },
                        ],
                    },
                ],
            },
            {
                "kind": "self",
                "label": "Link",
                "settings": [
                    {
                        "type": "select",
                        "label": "Open in",
                        "attribute": "target",
                        "options": [
                            {
                                "label": "Same tab",
                                "value": "_self",
                            },
                            {
                                "label": "New tab",
                                "value": "_blank",
                            },
                        ],
                        "defaultValue": "_self",
                    },
                    {
                        "type": "page-link",
                        "label": "Target page",
                        "attribute": "href",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                "label": "Avatar image (overrides initials)",
                "accepts": [
                    {
                        "kind": "media",
                        "accept": ["image"],
                    },
                ],
                "slot": "avatar",
                "max": 1,
            },
            {
                "label": "Name",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "name",
                "min": 1,
                "max": 1,
            },
            {
                "label": "Subtitle",
                "accepts": [
                    {
                        "kind": "any-component",
                    },
                ],
                "slot": "subtitle",
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
        this._observer.observe(this.target, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["color", "initials"],
        });
    }

    override unmountEditor(): void {
        this._observer?.disconnect();
        this._observer = undefined;
    }

    private _refresh = () => {
        const host = this.target;
        const name = this._readName(host);
        this._syncHasAvatar(host);
        this._syncInitials(host, name);
        this._syncAutoColor(host, name);
    };

    private _syncHasAvatar(host: HTMLElement) {
        const slot = host.querySelector(':scope > [slot="avatar"]');
        const hasImage =
            !!slot?.querySelector("img,picture,svg,video") || slot?.tagName === "IMG" || slot?.tagName === "PICTURE";
        host.toggleAttribute("has-avatar", !!hasImage);
    }

    private _readName(host: HTMLElement): string {
        const el = host.querySelector(':scope > [slot="name"]');
        return (el?.textContent || "").trim();
    }

    private _syncInitials(host: HTMLElement, name: string) {
        const override = host.getAttribute("initials");
        const value = (override && override.trim()) || BlocEditor.computeInitials(name);

        let node = host.querySelector(':scope > [slot="initials"]') as HTMLElement | null;
        if (!node) {
            node = document.createElement("span");
            node.setAttribute("slot", "initials");
            host.appendChild(node);
        }
        if (node.textContent !== value) {
            node.textContent = value;
        }
    }

    private _syncAutoColor(host: HTMLElement, name: string) {
        const color = host.getAttribute("color") || "auto";
        if (color !== "auto") {
            host.removeAttribute("data-auto-color");
            return;
        }
        const bucket = String(BlocEditor.hashBucket(name, AUTO_COLOR_BUCKETS));
        if (host.getAttribute("data-auto-color") !== bucket) {
            host.setAttribute("data-auto-color", bucket);
        }
    }

    static computeInitials(name: string): string {
        const parts = name.split(/[\s-]+/).filter((p) => p && /\p{L}/u.test(p[0]!));
        if (parts.length >= 2) {
            return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
        }
        if (parts.length === 1) {
            return parts[0]!.slice(0, 2).toUpperCase();
        }
        return "?";
    }

    static hashBucket(s: string, buckets: number): number {
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = (h * 31 + s.charCodeAt(i)) | 0;
        }
        return Math.abs(h) % buckets;
    }
}

registerEditor({ editor: BlocEditor });
