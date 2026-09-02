import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class RestaurantContactCardEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Presentation",
                settings: [
                    {
                        type: "segmented",
                        label: "Layout",
                        attribute: "presentation",
                        defaultValue: "split",
                        options: [
                            { label: "Split", value: "split" },
                            { label: "Stacked", value: "stacked" },
                            { label: "Compact", value: "sidebar" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Surface",
                        attribute: "surface",
                        defaultValue: "card",
                        options: [
                            { label: "Card", value: "card" },
                            { label: "Plain", value: "plain" },
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
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Opening status", slot: "status", accepts: [{ kind: "component", tag: "basic-badge" }], max: 1 },
            {
                label: "Title",
                slot: "title",
                accepts: [
                    { kind: "component", tag: "h1" },
                    { kind: "component", tag: "h2" },
                    { kind: "component", tag: "h3" },
                ],
                max: 1,
            },
            { label: "Introduction", slot: "description", accepts: [{ kind: "component", tag: "p" }], max: 1 },
            {
                label: "Contact details",
                slot: "contacts",
                accepts: [{ kind: "component", tag: "restaurant-contact-item" }],
                min: 1,
                max: 6,
            },
            {
                label: "Hours title",
                slot: "hours-title",
                accepts: [
                    { kind: "component", tag: "h2" },
                    { kind: "component", tag: "h3" },
                ],
                max: 1,
            },
            { label: "Opening hours", slot: "hours", accepts: [{ kind: "component", tag: "basic-table" }], max: 1 },
            { label: "Note", slot: "note", accepts: [{ kind: "any-component" }], max: 1 },
        ];
    }
}

registerEditor({ editor: RestaurantContactCardEditor });
