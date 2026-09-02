import { describe, expect, test } from "bun:test";
import { resolveTemplates, type IntegrationProvisionDeployment } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { StripeWebhookProvisioner } from "@bernouy/cms-integrations/stripe";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("stripe-connect 1.0.0 provisioning contract", () => {
    test("subscribes the Accounts v2 destination to account closure events", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repository.get("stripe-connect");
        const provision = definition?.provisions?.find(({ provider }) => provider === "stripe-webhooks");
        expect(provision).toBeDefined();
        if (!definition || !provision) {
            throw new Error("stripe-connect Stripe webhook provision is missing");
        }

        const resolved = resolveTemplates(provision, {
            answers: { id: "closed-event-contract" },
            secrets: {},
            connectorSecrets: { stripeSecretKey: "sk_test_contract" },
            connectors: {
                supabase: {
                    functionsBaseUrl: "https://project.supabase.co/functions/v1",
                },
            },
        });
        const deployment: IntegrationProvisionDeployment = {
            integrationKind: definition.kind,
            ...(definition.version ? { version: definition.version } : {}),
            provider: resolved.provider,
            configuration: resolved.configuration,
            outputs: resolved.outputs,
        };
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

        await provisioner.provision(deployment, { existingOutputs: {}, env: {} });

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
