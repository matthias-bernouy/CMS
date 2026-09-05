import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class PurchaseListEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Pagination",
                settings: [
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "en-US" },
                    { type: "text", label: "Page size", attribute: "page-size", defaultValue: "8" },
                    { type: "text", label: "Previous label", attribute: "previous-label", defaultValue: "Previous" },
                    { type: "text", label: "Next label", attribute: "next-label", defaultValue: "Next" },
                ],
            },
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    { type: "text", label: "Order URL pattern", attribute: "order-url" },
                    {
                        type: "text",
                        label: "Order action label",
                        attribute: "order-action-label",
                        defaultValue: "View order",
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: PurchaseListEditor });
