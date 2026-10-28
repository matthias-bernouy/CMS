import { expect, test } from "bun:test";
import type { ControlProviderClient } from "../../src/runtime/gateway/ControlProviderClient";
import { createEdgeGateway } from "../../src/runtime/gateway/createEdgeGateway";

test("logical capability resolution preserves command idempotency", async () => {
    const gateway = createEdgeGateway({
        getGatewayRoute: async () => JSON.stringify(routeSnapshot()),
    } as ControlProviderClient);

    await expect(gateway.resolveCapability("ulvia.cms.installations", "apply-collection-upgrade")).resolves.toEqual({
        access: "admin",
        version: "1.0.0",
        effect: "command",
        idempotency: "keyed",
        outputType: "object",
    });
});

function routeSnapshot() {
    const digest = `sha256:${"a".repeat(64)}`;
    const snapshot = {
        selection: {
            siteId: "default",
            contractId: "ulvia.cms.installations",
            version: "1.0.0",
            digest,
            installationId: "installation-a",
        },
        release: {
            admission: {
                release: {
                    version: "1.0.0",
                    capabilities: [
                        {
                            id: "apply-collection-upgrade",

                            access: "admin",
                            behavior: {
                                sensitive: false,
                                effect: "command",
                                execution: "operation",
                                idempotency: "keyed",
                            },
                            output: { type: "object" },
                        },
                    ],
                },
            },
        },
        requestedRelease: {},
        lineage: [
            {
                contractId: "ulvia.cms.installations",
                version: "1.0.0",
                digest,
                name: "Installations",
                capabilityIds: ["apply-collection-upgrade"],
            },
        ],
        manifest: {},
        installation: {
            installation: { id: "installation-a", endpoint: "http://provider.internal:5103", status: "enabled" },
            observation: {
                observedAt: "2026-10-24T10:00:00.000Z",
                report: {
                    implementations: [
                        {
                            contractId: "ulvia.cms.installations",
                            version: "1.0.0",
                            digest,
                            status: "ready",
                        },
                    ],
                },
            },
        },
    };
    snapshot.requestedRelease = snapshot.release;
    return snapshot;
}

test("logical capability metadata uses the requested parent release rather than its selected child", async () => {
    const snapshot = routeSnapshot();
    snapshot.requestedRelease = snapshot.release;
    snapshot.release = { admission: { release: { version: "2.0.0", capabilities: [] } } };
    const gateway = createEdgeGateway({
        getGatewayRoute: async () => JSON.stringify(snapshot),
    } as ControlProviderClient);
    expect(await gateway.resolveCapability("ulvia.cms.installations", "apply-collection-upgrade")).toMatchObject({
        version: "1.0.0",
        effect: "command",
        idempotency: "keyed",
    });
});
