import { activeEnv, createHarness, expect, integrationAnswers, jsonBody, test } from "../support";

export function registerConnectionTests(): void {
    test("saves and verifies Connection settings in one integration call", async () => {
        const harness = await createHarness({ trackingStatusCode: "0" });
        const { id: _id, ...answers } = integrationAnswers();
        const values = {
            ...answers,
            mondialRelayConnectPassword: "${CONNECT_PASSWORD}",
            mondialRelayTrackingPrivateKey: "${TRACKING_KEY}",
        };
        const response = await harness.edgeRequest(
            connectionRequest("/connection", {
                values,
                expectedRevision: null,
                _cms: {
                    installationId: "mondial-relay",
                    definitionVersion: "1.0.0",
                    secretValues: {
                        mondialRelayConnectPassword: answers.mondialRelayConnectPassword,
                        mondialRelayTrackingPrivateKey: answers.mondialRelayTrackingPrivateKey,
                    },
                    generatedSecretValues: {},
                    resolvedPages: {},
                },
            }),
        );
        const result = await jsonBody(response);

        expect(response.status).toBe(200);
        expect(result.appliedRevision).toBe(result.savedRevision);
        expect(harness.sourceSettingsRow()).toMatchObject({
            values,
            applied_revision: result.savedRevision,
            operation: "idle",
        });
        expect(harness.trackingRequestCount()).toBe(1);
        expect(
            (
                await harness.edgeRequest(
                    connectionRequest("/connection/retry", {
                        expectedRevision: "stale",
                        _cms: { installationId: "mondial-relay", secretValues: {} },
                    }),
                )
            ).status,
        ).toBe(409);
    });
}

function connectionRequest(path: string, body: Record<string, unknown>): Request {
    return new Request(`https://project.supabase.co/functions/v1/cms-delivery-v2${path}`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}`,
            "content-type": "application/json",
        },
        body: JSON.stringify(body),
    });
}
