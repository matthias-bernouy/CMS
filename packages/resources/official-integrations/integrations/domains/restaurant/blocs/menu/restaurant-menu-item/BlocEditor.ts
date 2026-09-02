import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class RestaurantMenuItemEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Presentation",
                settings: [
                    {
                        type: "segmented",
                        label: "Layout",
                        attribute: "layout",
                        defaultValue: "text",
                        options: [
                            { label: "Text", value: "text" },
                            { label: "With image", value: "media" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Image position",
                        attribute: "media-position",
                        defaultValue: "start",
                        options: [
                            { label: "Start", value: "start" },
                            { label: "End", value: "end" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Image ratio",
                        attribute: "media-ratio",
                        defaultValue: "square",
                        options: [
                            { label: "Landscape", value: "landscape" },
                            { label: "Square", value: "square" },
                            { label: "Portrait", value: "portrait" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Emphasis",
                        attribute: "emphasis",
                        defaultValue: "standard",
                        options: [
                            { label: "Standard", value: "standard" },
                            { label: "Signature", value: "signature" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Availability",
                        attribute: "availability",
                        defaultValue: "available",
                        options: [
                            { label: "Available", value: "available" },
                            { label: "Sold out", value: "sold-out" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Image", slot: "media", accepts: [{ kind: "component", tag: "img" }], max: 1 },
            { label: "Name", slot: "name", accepts: [{ kind: "component", tag: "h3" }], min: 1, max: 1 },
            { label: "Description", slot: "description", accepts: [{ kind: "component", tag: "p" }], max: 1 },
            { label: "Details", slot: "meta", accepts: [{ kind: "any-component" }], max: 3 },
            { label: "Price", slot: "price", accepts: [{ kind: "any-component" }], min: 1, max: 1 },
        ];
    }
}

registerEditor({ editor: RestaurantMenuItemEditor });
