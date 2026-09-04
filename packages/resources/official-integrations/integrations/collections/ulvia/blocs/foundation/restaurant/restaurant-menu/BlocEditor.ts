import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class RestaurantMenuEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Opening",
                settings: [
                    {
                        type: "segmented",
                        label: "Presentation",
                        attribute: "presentation",
                        defaultValue: "curtain",
                        options: [
                            { label: "Curtain", value: "curtain" },
                            { label: "Drawer", value: "drawer" },
                            { label: "Panel", value: "panel" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Motion",
                        attribute: "motion",
                        defaultValue: "smooth",
                        options: [
                            { label: "Smooth", value: "smooth" },
                            { label: "Snappy", value: "snappy" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Interior",
                settings: [
                    {
                        type: "segmented",
                        label: "Layout",
                        attribute: "layout",
                        defaultValue: "split",
                        options: [
                            { label: "Split", value: "split" },
                            { label: "Links", value: "links" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Media",
                        attribute: "media",
                        defaultValue: "show",
                        options: [
                            { label: "Show", value: "show" },
                            { label: "Hide", value: "hide" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Brand", slot: "brand", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Eyebrow", slot: "eyebrow", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Navigation", slot: "navigation", accepts: [{ kind: "component", tag: "a" }], max: 8 },
            { label: "Secondary links", slot: "secondary", accepts: [{ kind: "component", tag: "a" }], max: 4 },
            { label: "Image", slot: "media", accepts: [{ kind: "component", tag: "img" }], max: 1 },
            { label: "Details", slot: "details", accepts: [{ kind: "any-component" }], max: 3 },
            { label: "Footer links", slot: "footer", accepts: [{ kind: "component", tag: "a" }], max: 4 },
            { label: "Close label", slot: "close", accepts: [{ kind: "any-component" }], max: 1 },
        ];
    }
}

registerEditor({ editor: RestaurantMenuEditor });
