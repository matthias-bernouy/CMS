import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class CommerceNegotiationFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title", defaultValue: "Make a proposal" },
                    { type: "textarea", label: "Description", attribute: "copy" },
                    {
                        type: "text",
                        label: "Current price label",
                        attribute: "current-label",
                        defaultValue: "Current price",
                    },
                    {
                        type: "text",
                        label: "Range label",
                        attribute: "range-label",
                        defaultValue: "Allowed proposal",
                    },
                    { type: "text", label: "Amount label", attribute: "amount-label", defaultValue: "Your price (€)" },
                    { type: "textarea", label: "Amount hint", attribute: "amount-hint" },
                    {
                        type: "text",
                        label: "Message label",
                        attribute: "message-label",
                        defaultValue: "Message to seller (optional)",
                    },
                    { type: "text", label: "Message placeholder", attribute: "message-placeholder" },
                    {
                        type: "segmented",
                        label: "Seller message",
                        attribute: "show-message",
                        defaultValue: "true",
                        options: [
                            { label: "Visible", value: "true" },
                            { label: "Hidden", value: "false" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Button label",
                        attribute: "button-label",
                        defaultValue: "Submit my proposal",
                    },
                    { type: "textarea", label: "Success message", attribute: "success-message" },
                    {
                        type: "textarea",
                        label: "Existing proposal message",
                        attribute: "existing-message",
                        defaultValue: "You already submitted a proposal of {amount} for this offer.",
                    },
                    { type: "textarea", label: "Error message", attribute: "error-message" },
                    { type: "textarea", label: "Unavailable message", attribute: "unavailable-message" },
                    {
                        type: "textarea",
                        label: "Own offer message",
                        attribute: "own-offer-message",
                        defaultValue: "You cannot submit a proposal on your own offer.",
                    },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "plain",
                        options: ["plain", "outlined", "elevated"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Density",
                        attribute: "density",
                        defaultValue: "regular",
                        options: ["compact", "regular", "spacious"].map((value) => ({ label: value, value })),
                    },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    { type: "text", label: "Offer id", attribute: "offer-id" },
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "en-US" },
                ],
            },
        ];
    }
}

registerEditor({ editor: CommerceNegotiationFormEditor });
