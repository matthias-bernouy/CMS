import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class RestaurantHeaderEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Arrangement",
                        attribute: "layout",
                        defaultValue: "utility",
                        options: [
                            { label: "Utility", value: "utility" },
                            { label: "Compact", value: "compact" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Position",
                        attribute: "position",
                        defaultValue: "flow",
                        options: [
                            { label: "Flow", value: "flow" },
                            { label: "Overlay", value: "overlay" },
                            { label: "Sticky", value: "sticky" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Width",
                        attribute: "width",
                        defaultValue: "wide",
                        options: [
                            { label: "Wide", value: "wide" },
                            { label: "Full", value: "full" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "segmented",
                        label: "Surface",
                        attribute: "appearance",
                        defaultValue: "transparent",
                        options: [
                            { label: "Transparent", value: "transparent" },
                            { label: "Solid", value: "solid" },
                            { label: "Blurred", value: "blurred" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Menu button",
                        attribute: "menu-style",
                        defaultValue: "plain",
                        options: [
                            { label: "Plain", value: "plain" },
                            { label: "Outline", value: "outline" },
                            { label: "Underline", value: "underline" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Menu icon",
                        attribute: "menu-icon",
                        defaultValue: "lines",
                        options: [
                            { label: "Lines", value: "lines" },
                            { label: "Plus", value: "plus" },
                            { label: "None", value: "none" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Accessibility",
                settings: [
                    {
                        type: "text",
                        label: "Menu target",
                        attribute: "menu-target",
                        defaultValue: "restaurant-menu",
                    },
                    {
                        type: "text",
                        label: "Navigation label",
                        attribute: "navigation-label",
                        defaultValue: "Primary navigation",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Opening status",
                slot: "status",
                accepts: [
                    { kind: "component", tag: "basic-badge" },
                    { kind: "component", tag: "span" },
                ],
                max: 1,
            },
            {
                label: "Language selector",
                slot: "locale",
                accepts: [
                    { kind: "component", tag: "basic-select" },
                    { kind: "component", tag: "a" },
                ],
                max: 1,
            },
            { label: "Brand", slot: "brand", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Navigation", slot: "navigation", accepts: [{ kind: "component", tag: "a" }], max: 4 },
            {
                label: "Menu trigger",
                slot: "menu",
                accepts: [
                    { kind: "component", tag: "basic-menu" },
                    { kind: "component", tag: "button" },
                    { kind: "component", tag: "a" },
                ],
                max: 1,
            },
        ];
    }
}

registerEditor({ editor: RestaurantHeaderEditor });
