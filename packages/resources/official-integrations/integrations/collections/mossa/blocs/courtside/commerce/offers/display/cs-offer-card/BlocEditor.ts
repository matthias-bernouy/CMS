import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

const anyComponent = [{ kind: "any-component" as const }];

export class OfferCardEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Offer card",
                settings: [
                    {
                        type: "segmented",
                        label: "Layout",
                        attribute: "layout",
                        defaultValue: "summary",
                        options: [
                            { label: "Summary", value: "summary" },
                            { label: "Listing", value: "listing" },
                            { label: "Inline", value: "inline" },
                        ],
                    },
                    {
                        type: "select",
                        label: "Variant",
                        attribute: "variant",
                        defaultValue: "outlined",
                        options: [
                            { label: "Outlined", value: "outlined" },
                            { label: "Elevated", value: "elevated" },
                            { label: "Filled", value: "filled" },
                        ],
                    },
                    {
                        type: "toggle",
                        label: "Interactive",
                        attribute: "interactive",
                        defaultValue: false,
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Navigation", slot: "navigation", max: 1, accepts: [{ kind: "component", tag: "a" }] },
            { label: "Media", slot: "media", max: 1, accepts: [{ kind: "media", accept: ["image", "svg"] }] },
            { label: "Badges", slot: "badge", accepts: anyComponent },
            { label: "Eyebrow", slot: "eyebrow", max: 1, accepts: anyComponent },
            { label: "Title", slot: "title", min: 1, max: 1, accepts: anyComponent },
            { label: "Description", slot: "description", max: 1, accepts: anyComponent },
            { label: "Price", slot: "price", max: 1, accepts: anyComponent },
            { label: "Additional content", accepts: anyComponent },
            { label: "Action", slot: "action", max: 1, accepts: anyComponent },
        ];
    }
}

registerEditor({ editor: OfferCardEditor });
