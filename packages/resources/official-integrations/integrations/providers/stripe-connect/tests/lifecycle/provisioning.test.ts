import { describe, expect, test } from "bun:test";
import { StripeWebhookProvisioner } from "../../connectors/supabase/functions/cms-stripe-connect-management/lifecycle/webhooks/StripeWebhookProvisioner.ts";
import { capturedRequest, json, stripeEndpoint, stripeWebhookDeployment } from "./provisioning-fixtures";

describe("StripeWebhookProvisioner", () => {
    test("creates v1 and v2 destinations and can roll them back", async () => {
        const requests: Array<{ url: string; method: string; headers: Headers; body: string }> = [];
        let v1Create = 0;
        const provisioner = new StripeWebhookProvisioner({
            apiBaseUrl: "https://stripe.test",
            allowInsecureLoopbackWebhooks: true,
            fetch: async (input, init) => {
                const request = await capturedRequest(input, init);
                requests.push(request);
                if (request.method === "GET") {
                    return json({ data: [] });
                }
                if (request.url.endsWith("/v1/webhook_endpoints") && request.method === "POST") {
                    v1Create += 1;
                    return json({ id: `we_${v1Create}`, secret: `whsec_v1_${v1Create}` });
                }
                if (request.url.endsWith("/v2/core/event_destinations") && request.method === "POST") {
                    return json({
                        id: "ed_1",
                        webhook_endpoint: { signing_secret: "whsec_v2" },
                    });
                }
                return json({ id: "deleted" });
            },
        });

        const deployment = stripeWebhookDeployment();
        for (const destination of deployment.configuration.destinations as Array<Record<string, unknown>>) {
            destination.url = "http://127.0.0.1/functions/v1/webhook";
        }
        const result = await provisioner.provision(deployment, { existingOutputs: {} });

        expect(result.outputs).toEqual({
            platform: "whsec_v1_1",
            connect: "whsec_v1_2",
            accountsV2: "whsec_v2",
        });
        expect(result.resources).toEqual([
            { type: "webhook_endpoint", id: "we_1", action: "created" },
            { type: "webhook_endpoint", id: "we_2", action: "created" },
            { type: "event_destination", id: "ed_1", action: "created" },
        ]);
        const createRequests = requests.filter(({ method }) => method === "POST");
        expect(createRequests[0]?.headers.get("authorization")).toBe("Bearer sk_test_private");
        expect(createRequests[0]?.headers.get("idempotency-key")).toMatch(/^cmscore-webhook-/);
        expect(new URLSearchParams(createRequests[0]?.body).get("connect")).toBe("false");
        expect(new URLSearchParams(createRequests[1]?.body).get("connect")).toBe("true");
        expect(JSON.parse(createRequests[2]?.body).include).toContain("webhook_endpoint.signing_secret");

        await result.rollback?.();
        expect(requests.filter(({ method }) => method === "DELETE").map(({ url }) => url)).toEqual([
            "https://stripe.test/v2/core/event_destinations/ed_1",
            "https://stripe.test/v1/webhook_endpoints/we_2",
            "https://stripe.test/v1/webhook_endpoints/we_1",
        ]);
        expect(JSON.stringify(result)).not.toContain("sk_test_private");
    });

    test.each([
        { configuredEventSource: "self", listedEventSource: "@self" },
        { configuredEventSource: "other_accounts", listedEventSource: "@accounts" },
    ] as const)(
        "updates owned destinations when Stripe lists $listedEventSource and reuses stored signing secrets",
        async ({ configuredEventSource, listedEventSource }) => {
            const requests: Array<{ url: string; method: string; body: string }> = [];
            const provisioner = new StripeWebhookProvisioner({
                apiBaseUrl: "https://stripe.test",
                fetch: async (input, init) => {
                    const request = await capturedRequest(input, init);
                    requests.push(request);
                    if (request.url.includes("/v1/webhook_endpoints?")) {
                        return json({
                            data: [stripeEndpoint("we_platform", "platform"), stripeEndpoint("we_connect", "connect")],
                        });
                    }
                    if (request.url.includes("/v2/core/event_destinations?")) {
                        return json({
                            data: [
                                {
                                    id: "ed_accounts",
                                    event_payload: "thin",
                                    events_from: [listedEventSource],
                                    status: "enabled",
                                    metadata: {
                                        cmscore_integration: "stripe-connect",
                                        cmscore_instance: "main",
                                        cmscore_destination: "accountsV2",
                                    },
                                },
                            ],
                        });
                    }
                    if (
                        request.method === "POST" &&
                        request.url.includes("/v1/webhook_endpoints/") &&
                        new URLSearchParams(request.body).has("status")
                    ) {
                        return json({ error: { message: "Received unknown parameter: status" } }, 400);
                    }
                    return json({ id: "updated" });
                },
            });
            const existingOutputs = {
                platform: "whsec_existing_platform",
                connect: "whsec_existing_connect",
                accountsV2: "whsec_existing_v2",
            };

            const result = await provisioner.provision(stripeWebhookDeployment([configuredEventSource]), {
                existingOutputs,
            });

            expect(result.outputs).toEqual(existingOutputs);
            expect(result.resources?.every(({ action }) => action === "updated")).toBe(true);
            const updateRequests = requests.filter(({ method }) => method === "POST");
            expect(updateRequests).toHaveLength(3);
            const platformUpdate = new URLSearchParams(updateRequests[0]?.body);
            const connectUpdate = new URLSearchParams(updateRequests[1]?.body);
            for (const update of [platformUpdate, connectUpdate]) {
                expect(update.get("disabled")).toBe("false");
                expect(update.has("status")).toBe(false);
                expect(update.has("connect")).toBe(false);
                expect(update.has("api_version")).toBe(false);
            }
            const accountsV2Update = JSON.parse(updateRequests[2]?.body ?? "{}");
            expect(accountsV2Update).not.toHaveProperty("status");
            expect(accountsV2Update).not.toHaveProperty("disabled");
            expect(accountsV2Update.enabled_events).toEqual(["v2.core.account[requirements].updated"]);
            expect(requests.some(({ method }) => method === "DELETE")).toBe(false);
        },
    );

    test("fails closed when Stripe owns a destination whose secret is not stored", async () => {
        const provisioner = new StripeWebhookProvisioner({
            apiBaseUrl: "https://stripe.test",
            fetch: async (input) =>
                String(input).includes("/v1/webhook_endpoints?")
                    ? json({ data: [stripeEndpoint("we_platform", "platform")] })
                    : json({ data: [] }),
        });

        await expect(provisioner.provision(stripeWebhookDeployment(), { existingOutputs: {} })).rejects.toThrow(
            /already exists but its signing secret is missing/,
        );
    });

    test("redacts the Stripe API key from provider errors", async () => {
        const provisioner = new StripeWebhookProvisioner({
            apiBaseUrl: "https://stripe.test",
            fetch: async () => json({ error: { message: "Invalid API Key provided: sk_test_private" } }, 401),
        });

        const error = await capturedError(provisioner.provision(stripeWebhookDeployment(), { existingOutputs: {} }));
        expect(error.message).toBe("Stripe provisioning request failed (401)");
        expect(error.message).not.toContain("sk_test_private");
    });
});

async function capturedError(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(Error);
        return error as Error;
    }
    throw new Error("expected operation to fail");
}
