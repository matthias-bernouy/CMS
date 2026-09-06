import { describe, expect, test } from "bun:test";
import { StripeWebhookProvisioner } from "../../connectors/supabase/functions/cms-stripe-connect-management/lifecycle/webhooks/StripeWebhookProvisioner.ts";
import type { IntegrationProvisionDeployment } from "../../connectors/supabase/functions/cms-stripe-connect-management/lifecycle/webhooks/contracts.ts";
import configuration from "../../connectors/supabase/functions/cms-stripe-connect-management/lifecycle/webhooks/destinations.json";

describe("stripe-connect 1.0.0 provisioning contract", () => {
    test("subscribes the Accounts v2 destination to account closure events", async () => {
        const deployment = {
            integrationKind: "stripe-connect",
            version: "1.0.0",
            configuration: {
                ...configuration,
                owner: "closed-event-contract",
                secretKey: "sk_test_contract",
                destinations: configuration.destinations.map((value) => ({
                    ...value,
                    url: `https://project.supabase.co/functions/v1${value.url}`,
                })),
            },
            outputs: configuration.destinations.map(({ name }) => ({ name })),
        } as IntegrationProvisionDeployment;
        const requests: Array<{ url: string; method: string; body: string }> = [];
        let v1CreateCount = 0;
        const provisioner = new StripeWebhookProvisioner({
            apiBaseUrl: "https://stripe.test",
            fetch: async (input, init) => {
                const request = {
                    url: String(input),
                    method: init?.method ?? "GET",
                    body: typeof init?.body === "string" ? init.body : "",
                };
                requests.push(request);
                if (request.method === "GET") {
                    return Response.json({ data: [] });
                }
                if (request.url.endsWith("/v1/webhook_endpoints")) {
                    v1CreateCount += 1;
                    return Response.json({
                        id: `we_${v1CreateCount}`,
                        secret: `whsec_v1_${v1CreateCount}`,
                    });
                }
                if (request.url.endsWith("/v2/core/event_destinations")) {
                    return Response.json({
                        id: "ed_accounts_v2",
                        webhook_endpoint: { signing_secret: "whsec_accounts_v2" },
                    });
                }
                return Response.json({});
            },
        });

        await provisioner.provision(deployment, { existingOutputs: {} });

        const request = requests.find(
            ({ url, method }) => url.endsWith("/v2/core/event_destinations") && method === "POST",
        );
        expect(request).toBeDefined();
        const body = JSON.parse(request?.body ?? "{}") as {
            event_payload?: string;
            events_from?: string[];
            enabled_events?: string[];
        };
        expect(body.event_payload).toBe("thin");
        expect(body.events_from).toEqual(["self"]);
        expect(body.enabled_events).toContain("v2.core.account.closed");
        expect(body.enabled_events?.filter((event) => event === "v2.core.account.closed")).toHaveLength(1);
    });
});
