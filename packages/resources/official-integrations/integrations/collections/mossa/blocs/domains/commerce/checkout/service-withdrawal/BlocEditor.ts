import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";

import { withdrawalCopy } from "./copy";

export class ServiceWithdrawalFormEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Request copy",
                settings: Object.entries(withdrawalCopy).map(([attribute, defaultValue]) => ({
                    type: "text" as const,
                    attribute,
                    label: attribute.replaceAll("-", " "),
                    defaultValue,
                })),
            },
            {
                kind: "self",
                label: "State copy",
                settings: [
                    {
                        type: "text",
                        label: "Error title",
                        attribute: "error-title",
                        defaultValue: "Request unavailable",
                    },
                    {
                        type: "text",
                        label: "Error message",
                        attribute: "error-message",
                        defaultValue: "Your orders could not be loaded. Sign in and try again.",
                    },
                    {
                        type: "text",
                        label: "No orders message",
                        attribute: "empty-message",
                        defaultValue: "No order is available on this account.",
                    },
                    { type: "text", label: "Retry action", attribute: "retry-label", defaultValue: "Try again" },
                ],
            },
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
