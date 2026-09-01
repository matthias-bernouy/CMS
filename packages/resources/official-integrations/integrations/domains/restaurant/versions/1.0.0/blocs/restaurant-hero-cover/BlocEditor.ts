import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class RestaurantHeroCoverEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Content position",
                        attribute: "content-position",
                        defaultValue: "start",
                        options: [
                            { label: "Start", value: "start" },
                            { label: "Center", value: "center" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Height",
                        attribute: "height",
                        defaultValue: "screen",
                        options: [
                            { label: "Content", value: "content" },
                            { label: "Screen", value: "screen" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Spacing",
                        attribute: "density",
                        defaultValue: "regular",
                        options: [
                            { label: "Compact", value: "compact" },
                            { label: "Regular", value: "regular" },
                            { label: "Spacious", value: "spacious" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Image overlay",
                        attribute: "overlay",
                        defaultValue: "strong",
                        options: [
                            { label: "Soft", value: "soft" },
                            { label: "Strong", value: "strong" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Thumbnail rail",
                        attribute: "gallery",
                        defaultValue: "show",
                        options: [
                            { label: "Show", value: "show" },
                            { label: "Hide", value: "hide" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Autoplay",
                        attribute: "autoplay",
                        defaultValue: "on",
                        options: [
                            { label: "On", value: "on" },
                            { label: "Off", value: "off" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Rotation interval",
                        attribute: "rotation-interval",
                        defaultValue: "5",
                        options: [
                            { label: "5 s", value: "5" },
                            { label: "8 s", value: "8" },
                            { label: "10 s", value: "10" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Emblem",
                        attribute: "emblem",
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
            { label: "Brand", slot: "brand", accepts: [{ kind: "component", tag: "h1" }], min: 1, max: 1 },
            { label: "Subtitle", slot: "subtitle", accepts: [{ kind: "component", tag: "p" }], max: 1 },
            { label: "Actions", slot: "actions", accepts: [{ kind: "component", tag: "a" }], max: 2 },
            { label: "Details", slot: "details", accepts: [{ kind: "any-component" }], max: 3 },
            { label: "Cover image", slot: "media", accepts: [{ kind: "component", tag: "img" }], min: 1, max: 1 },
            { label: "Thumbnail rail", slot: "gallery", accepts: [{ kind: "component", tag: "img" }], max: 5 },
        ];
    }
}

registerEditor({ editor: RestaurantHeroCoverEditor });
