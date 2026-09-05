import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class ServiceWithdrawalFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Contract",
                settings: [
                    { type: "text", label: "Locale", attribute: "locale", defaultValue: "en-US" },
                    {
                        type: "text",
                        label: "Service scope",
                        attribute: "service-scope",
                        defaultValue: "marketplace_service",
                    },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    {
                        type: "text",
                        label: "Order URL parameter",
                        attribute: "order-param",
                        defaultValue: "orderId",
                    },
                ],
            },
        ];
    }
}

registerEditor({ editor: ServiceWithdrawalFormEditor });
