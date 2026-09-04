import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

export class ServiceWithdrawalFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Contract",
                settings: [
                    {
                        type: "text",
                        label: "Service scope",
                        attribute: "service-scope",
                        defaultValue: "courtside_marketplace_service",
                    },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    {
                        type: "text",
                        label: "Commerce source",
                        attribute: "source-id",
                        defaultValue: "commerce",
                    },
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
