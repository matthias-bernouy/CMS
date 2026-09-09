import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";
import { accountFieldLabels, accountMessages } from "./copy";
import { fieldStyleSection, notificationSection, visibility } from "./editorSections";

export class UserAccountFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [{ type: "text", label: "Button label", attribute: "button-label", defaultValue: "Save" }],
            },
            fieldStyleSection(),
            {
                kind: "self",
                label: "Identity fields",
                settings: [
                    visibility("Given name", "show-given-name"),
                    visibility("Surname", "show-surname"),
                    visibility("Birth date", "show-birth-date"),
                    visibility("Email address", "show-email"),
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
            notificationSection(),
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
