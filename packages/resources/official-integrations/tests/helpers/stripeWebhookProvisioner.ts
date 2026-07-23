import type { IntegrationProvisioner } from "@bernouy/cms-integrations";

export function stripeWebhookProvisioner(
    values: Record<string, string> = {
        stripeWebhookSecret: "whsec_test_123",
        stripeConnectWebhookSecret: "whsec_connect_test_456",
        stripeConnectV2WebhookSecret: "whsec_connect_v2_test_789",
    },
): IntegrationProvisioner {
    return {
        provider: "stripe-webhooks",
        async provision() {
            return {
                outputs: values,
                resources: [
                    { type: "webhook_endpoint", id: "we_platform", action: "created" },
                    { type: "webhook_endpoint", id: "we_connect", action: "created" },
                    { type: "event_destination", id: "ed_accounts_v2", action: "created" },
                ],
            };
        },
    };
}
