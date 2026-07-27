import { Editor, type SettingSection } from "@bernouy/cms-content/editor";

export class SignupLegalConsentEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Heading", attribute: "heading" },
                    { type: "text", label: "Loading message", attribute: "loading-label" },
                    { type: "text", label: "Load error message", attribute: "load-error-label" },
                    { type: "text", label: "Retry button", attribute: "retry-label" },
                    { type: "text", label: "Required message", attribute: "required-message" },
                    { type: "text", label: "New tab notice", attribute: "new-tab-label" },
                ],
            },
            {
                kind: "self",
                label: "Source",
                settings: [
                    {
                        type: "text",
                        label: "Source prefix",
                        attribute: "source-prefix",
                        defaultValue: "/.cms/sources",
                    },
                    {
                        type: "text",
                        label: "Authentication source",
                        attribute: "source-id",
                        defaultValue: "system-auth",
                    },
                ],
            },
        ];
    }

    protected override structureMode(): "opaque" {
        return "opaque";
    }
}
