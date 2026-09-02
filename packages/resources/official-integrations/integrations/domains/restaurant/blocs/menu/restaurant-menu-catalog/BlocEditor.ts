import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class RestaurantMenuCatalogEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Presentation",
                settings: [
                    {
                        type: "segmented",
                        label: "Menu layout",
                        attribute: "presentation",
                        defaultValue: "tabs",
                        options: [
                            { label: "Categories", value: "tabs" },
                            { label: "All sections", value: "stacked" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Navigation",
                        attribute: "navigation",
                        defaultValue: "static",
                        options: [
                            { label: "Static", value: "static" },
                            { label: "Sticky", value: "sticky" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Surface",
                        attribute: "surface",
                        defaultValue: "plain",
                        options: [
                            { label: "Plain", value: "plain" },
                            { label: "Card", value: "card" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Color scheme",
                        attribute: "scheme",
                        defaultValue: "light",
                        options: [
                            { label: "Light", value: "light" },
                            { label: "Dark", value: "dark" },
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
                ],
            },
            {
                kind: "self",
                label: "Accessibility",
                settings: [
                    {
                        type: "text",
                        label: "Category navigation label",
                        attribute: "navigation-label",
                        defaultValue: "Menu categories",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Eyebrow", slot: "eyebrow", accepts: [{ kind: "any-component" }], max: 1 },
            {
                label: "Title",
                slot: "title",
                accepts: [
                    { kind: "component", tag: "h1" },
                    { kind: "component", tag: "h2" },
                ],
                min: 1,
                max: 1,
            },
            { label: "Introduction", slot: "description", accepts: [{ kind: "component", tag: "p" }], max: 1 },
            {
                label: "Menu sections",
                accepts: [{ kind: "component", tag: "restaurant-menu-section" }],
                min: 1,
                max: 12,
            },
        ];
    }
}

registerEditor({ editor: RestaurantMenuCatalogEditor });
