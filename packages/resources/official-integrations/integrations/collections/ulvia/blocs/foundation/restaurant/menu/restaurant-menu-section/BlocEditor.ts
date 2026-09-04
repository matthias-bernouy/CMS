import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class RestaurantMenuSectionEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Columns",
                        attribute: "columns",
                        defaultValue: "one",
                        options: [
                            { label: "One", value: "one" },
                            { label: "Two", value: "two" },
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
                        label: "Icon",
                        attribute: "icon",
                        defaultValue: "show",
                        options: [
                            { label: "Show", value: "show" },
                            { label: "Hide", value: "hide" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    {
                        type: "text",
                        label: "Section anchor",
                        attribute: "anchor",
                        help: "Stable identifier used by category navigation and direct links.",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Icon", slot: "icon", accepts: [{ kind: "component", tag: "svg" }], max: 1 },
            { label: "Title", slot: "title", accepts: [{ kind: "component", tag: "h2" }], min: 1, max: 1 },
            { label: "Description", slot: "description", accepts: [{ kind: "component", tag: "p" }], max: 1 },
            {
                label: "Dishes",
                accepts: [{ kind: "component", tag: "restaurant-menu-item" }],
                min: 1,
                max: 20,
            },
        ];
    }
}

registerEditor({ editor: RestaurantMenuSectionEditor });
