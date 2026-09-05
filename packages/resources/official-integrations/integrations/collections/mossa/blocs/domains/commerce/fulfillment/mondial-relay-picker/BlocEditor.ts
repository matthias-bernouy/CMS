import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

import { relayCopy } from "./runtime/copy";

export class MondialRelayPickerEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Search copy",
                settings: Object.entries(relayCopy).map(([attribute, defaultValue]) => ({
                    type: "text" as const,
                    attribute,
                    label: attribute.replaceAll("-", " "),
                    defaultValue,
                })),
            },
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
                    {
                        type: "text",
                        label: "Delivery source installation id",
                        attribute: "source-id",
                        defaultValue: "delivery",
                        help: "Use the id chosen when the Mondial Relay Source was installed.",
                    },
                    { type: "text", label: "Commerce order identifier", attribute: "order-id" },
                    { type: "text", label: "Postal code", attribute: "postal-code" },
                    { type: "text", label: "City", attribute: "city" },
                    { type: "text", label: "Country code", attribute: "country" },
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
                    { type: "text", label: "Select relay", attribute: "selection-label", defaultValue: "Select" },
                    { type: "text", label: "Change relay", attribute: "change-label", defaultValue: "Change" },
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
        ];
    }
}

registerEditor({ editor: MondialRelayPickerEditor });
