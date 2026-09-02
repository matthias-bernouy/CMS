import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({
    type: "color",
    label,
    attribute,
});

export class MondialRelayPickerEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Checkout data",
                settings: [
                    {
                        type: "segmented",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "card",
                        options: [
                            { label: "Card", value: "card" },
                            { label: "Embedded", value: "embedded" },
                        ],
                    },
                    { type: "text", label: "Mondial Relay source", attribute: "source-id", defaultValue: "delivery" },
                    { type: "text", label: "Commerce order identifier", attribute: "order-id" },
                    { type: "text", label: "Postal code", attribute: "postal-code" },
                    { type: "text", label: "City", attribute: "city" },
                    { type: "text", label: "Parcel weight in grams", attribute: "weight-grams" },
                ],
            },
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title" },
                    { type: "textarea", label: "Description", attribute: "copy" },
                    { type: "text", label: "Search button", attribute: "button-label" },
                    { type: "text", label: "Select relay", attribute: "selection-label", defaultValue: "Sélectionner" },
                    { type: "text", label: "Change relay", attribute: "change-label", defaultValue: "Modifier" },
                    {
                        type: "segmented",
                        label: "Search prefilled address automatically",
                        attribute: "auto-search",
                        defaultValue: "true",
                        options: [
                            { label: "Yes", value: "true" },
                            { label: "No", value: "false" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Accent", "accent-color"),
                    color("Background", "background-color"),
                    color("Border", "border-color"),
                    color("Text", "text-color"),
                ],
            },
        ];
    }
}

registerEditor({ editor: MondialRelayPickerEditor });
