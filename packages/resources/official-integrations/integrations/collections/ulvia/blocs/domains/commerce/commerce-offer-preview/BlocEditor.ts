import {
    Editor,
    registerEditor,
    type ColorSetting,
    type ContentSlot,
    type SettingSection,
} from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({ type: "color", label, attribute });
const anyComponent = [{ kind: "any-component" as const }];

export class CommerceOfferPreviewEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Price",
                settings: [
                    { type: "text", label: "Amount in minor units", attribute: "amount" },
                    { type: "text", label: "Currency", attribute: "currency", defaultValue: "EUR" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "fr-FR" },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "outlined",
                        options: [
                            { label: "Plain", value: "plain" },
                            { label: "Outlined", value: "outlined" },
                            { label: "Elevated", value: "elevated" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Density",
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
                        label: "Height",
                        attribute: "stretch",
                        defaultValue: "false",
                        options: [
                            { label: "Content", value: "false" },
                            { label: "Stretch", value: "true" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Text", "text-color"),
                    color("Muted text", "muted-text-color"),
                    color("Background", "background-color"),
                    color("Border", "border-color"),
                    color("Accent", "accent-color"),
                    color("Price", "price-color"),
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Navigation",
                slot: "navigation",
                max: 1,
                accepts: [{ kind: "component", tag: "a" }],
            },
            { label: "Media", slot: "media", max: 1, accepts: anyComponent },
            { label: "Badges", slot: "badge", accepts: anyComponent },
            { label: "Eyebrow", slot: "eyebrow", max: 1, accepts: anyComponent },
            { label: "Title", slot: "title", max: 1, accepts: anyComponent },
            { label: "Description", slot: "description", max: 1, accepts: anyComponent },
            { label: "Price", slot: "price", max: 1, accepts: anyComponent },
            { label: "Details", accepts: anyComponent },
            { label: "Action", slot: "action", max: 1, accepts: anyComponent },
        ];
    }
}

registerEditor({ editor: CommerceOfferPreviewEditor });
