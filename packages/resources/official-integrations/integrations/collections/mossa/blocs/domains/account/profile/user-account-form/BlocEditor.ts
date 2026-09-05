import { Editor, registerEditor, type SegmentedSetting, type SettingSection } from "@bernouy/cms-content/editor";
import { accountFieldLabels, accountMessages } from "./copy";

const visibility = (label: string, attribute: string): SegmentedSetting => ({
    type: "segmented",
    label,
    attribute,
    defaultValue: "true",
    options: [
        { label: "Show", value: "true" },
        { label: "Hide", value: "false" },
    ],
});

export class UserAccountFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [{ type: "text", label: "Button label", attribute: "button-label", defaultValue: "Save" }],
            },
            {
                kind: "self",
                label: "Identity fields",
                settings: [
                    visibility("Given name", "show-given-name"),
                    visibility("Surname", "show-surname"),
                    visibility("Birth date", "show-birth-date"),
                ],
            },
            {
                kind: "self",
                label: "Field labels",
                settings: Object.entries(accountFieldLabels).map(([field, label]) => ({
                    type: "text",
                    label,
                    attribute: `${field}-label`,
                    defaultValue: label,
                })),
            },
            {
                kind: "self",
                label: "Status messages",
                settings: Object.entries({ ...accountMessages, "loading-label": "Loading your information" }).map(
                    ([attribute, defaultValue]) => ({
                        type: "text",
                        label: attribute.replaceAll("-", " "),
                        attribute,
                        defaultValue,
                    }),
                ),
            },
            {
                kind: "self",
                label: "Notifications",
                settings: [
                    {
                        type: "select",
                        label: "Position",
                        attribute: "toast-position",
                        defaultValue: "top-right",
                        options: [
                            { label: "Top right", value: "top-right" },
                            { label: "Top left", value: "top-left" },
                            { label: "Bottom right", value: "bottom-right" },
                            { label: "Bottom left", value: "bottom-left" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Width",
                        attribute: "toast-width",
                        defaultValue: "auto",
                        options: [
                            { label: "Auto", value: "auto" },
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                            { label: "Full", value: "full" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Density",
                        attribute: "toast-density",
                        defaultValue: "regular",
                        options: [
                            { label: "Compact", value: "compact" },
                            { label: "Regular", value: "regular" },
                            { label: "Spacious", value: "spacious" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Radius",
                        attribute: "toast-radius",
                        defaultValue: "md",
                        options: [
                            { label: "None", value: "none" },
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                            { label: "Pill", value: "pill" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Shadow",
                        attribute: "toast-shadow",
                        defaultValue: "none",
                        options: [
                            { label: "None", value: "none" },
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "L", value: "lg" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Success duration",
                        attribute: "success-toast-duration",
                        defaultValue: "4500",
                    },
                    {
                        type: "text",
                        label: "Error duration",
                        attribute: "error-toast-duration",
                        defaultValue: "6000",
                    },
                ],
            },
            {
                kind: "self",
                label: "Contact fields",
                settings: [visibility("Phone", "show-phone"), visibility("Avatar image", "show-avatar")],
            },
            {
                kind: "self",
                label: "Address fields",
                settings: [
                    visibility("Address line 1", "show-address-line-1"),
                    visibility("Address line 2", "show-address-line-2"),
                    visibility("Address line 3", "show-address-line-3"),
                    visibility("Postal code", "show-postal-code"),
                    visibility("City", "show-city"),
                    visibility("Region / state", "show-region"),
                    visibility("Country code", "show-country-code"),
                ],
            },
            {
                kind: "self",
                label: "Regional preferences",
                settings: [visibility("Locale", "show-locale"), visibility("Timezone", "show-timezone")],
            },
        ];
    }
}

registerEditor({ editor: UserAccountFormEditor });
