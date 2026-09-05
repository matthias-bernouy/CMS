import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class ConsentFieldEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Consent",
                settings: [{ type: "text", label: "Context", attribute: "context-key", defaultValue: "signup" }],
            },
            {
                kind: "self",
                label: "Appearance",
                settings: [
                    {
                        type: "select",
                        label: "Density",
                        attribute: "appearance",
                        defaultValue: "detailed",
                        options: [
                            { value: "detailed", label: "Detailed" },
                            { value: "compact", label: "Compact" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Copy",
                settings: [
                    { type: "text", label: "Heading", attribute: "heading" },
                    { type: "text", label: "Loading", attribute: "loading-label" },
                    { type: "text", label: "Load error", attribute: "load-error-label" },
                    { type: "text", label: "Retry", attribute: "retry-label" },
                    { type: "text", label: "Required", attribute: "required-message" },
                    { type: "text", label: "Changed requirements", attribute: "changed-label" },
                    { type: "text", label: "New tab", attribute: "new-tab-label" },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Consent states", accepts: [{ kind: "any-component" }], min: 1 }];
    }
}

registerEditor({ editor: ConsentFieldEditor });
