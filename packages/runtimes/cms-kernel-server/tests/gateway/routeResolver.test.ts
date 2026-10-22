import { expect, test } from "bun:test";
import { ControlGatewayRouteResolver } from "../../src/runtime/gateway/RemoteGatewayServices";
import type { ControlProviderClient } from "../../src/runtime/gateway/ControlProviderClient";

test("remote route freshness ignores observation renewal but fences selection and readiness changes", async () => {
    const route = routeSnapshot();
    let current = route;
    const resolver = new ControlGatewayRouteResolver({
        getGatewayRoute: async () => JSON.stringify(current),
    } as ControlProviderClient);
    const resolved = await resolver.resolve("default", "catalog.items");
    expect(resolved).not.toBeNull();

    current = {
        ...route,
        installation: {
            ...route.installation,
            observation: { ...route.installation.observation, observedAt: "2026-10-22T10:01:00.000Z" },
        },
    };
    expect(await resolver.isCurrent(resolved!)).toBeTrue();

    current = { ...route, selection: { ...route.selection, version: "1.1.0" } };
    expect(await resolver.isCurrent(resolved!)).toBeFalse();

    current = {
        ...route,
        installation: {
            ...route.installation,
            observation: {
                ...route.installation.observation,
                report: {
                    implementations: [
                        { ...route.installation.observation.report.implementations[0]!, status: "unavailable" },
                    ],
                },
            },
        },
    };
    expect(await resolver.isCurrent(resolved!)).toBeFalse();
});

function routeSnapshot() {
    return {
        selection: {
            siteId: "default",
            contractId: "catalog.items",
            version: "1.0.0",
            digest: `sha256:${"a".repeat(64)}`,
            installationId: "installation-a",
        },
        release: {},
        manifest: {},
        installation: {
            installation: { id: "installation-a", endpoint: "http://provider.internal:5103", status: "enabled" },
            observation: {
                observedAt: "2026-10-22T10:00:00.000Z",
                report: {
                    implementations: [
                        {
                            contractId: "catalog.items",
                            version: "1.0.0",
                            digest: `sha256:${"a".repeat(64)}`,
                            status: "ready",
                        },
                    ],
                },
            },
        },
    };
}
