import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class CommerceAccountSalesEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Navigation",
                settings: [
                    {
                        type: "text",
                        label: "Error message",
                        attribute: "error-message",
                        defaultValue: "Sales could not be loaded. Try again shortly.",
                    },
                    { type: "text", label: "Sale URL pattern", attribute: "sale-url" },
                    {
                        type: "text",
                        label: "Sale action label",
                        attribute: "sale-action-label",
                        defaultValue: "View sale",
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: CommerceAccountSalesEditor });
