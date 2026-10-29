import { expect, test } from "bun:test";
import { CatalogueGatewayRouteResolver, type CatalogueGatewayRouteResolverOptions } from "@bernouy/cms-gateway";
import type { ProviderExecutionState } from "@bernouy/cms-repository/providers/selections";
import { gatewayRoute } from "../../fixtures";

test("a routing hint cannot retain an old destination after a selection redirect", async () => {
    const first = await gatewayRoute();
    const second = await gatewayRoute({ installationId: "install-b", endpoint: "https://second.test" });
    let state: ProviderExecutionState = {
        selections: {
            siteId: "site-a",
            revision: 1,
            dependencyRevision: "initial",
            grants: { default: "allow-selected", denied: [] },
            plan: { selections: [first.selection] } as never,
        },
        installations: [first.installation, second.installation],
    };
    const requested: string[][] = [];
    let payloadReads = 0;
    const resolver = new CatalogueGatewayRouteResolver({
        selections: { get: async () => state.selections } as CatalogueGatewayRouteResolverOptions["selections"],
        installations: {
            get: async ({ installationId }) => {
                payloadReads++;
                return state.installations.find((item) => item.installation.id === installationId) ?? null;
            },
        } as CatalogueGatewayRouteResolverOptions["installations"],
        executionState: {
            read: async (_siteId, ids) => {
                requested.push([...ids]);
                return structuredClone({
                    ...state,
                    installations: state.installations.filter((item) => ids.includes(item.installation.id)),
                });
            },
        },
        releases: { get: async () => first.release } as unknown as CatalogueGatewayRouteResolverOptions["releases"],
        manifests: {
            findByDigest: async (digest) =>
                digest === first.manifest.admission.digest ? first.manifest : second.manifest,
        } as unknown as CatalogueGatewayRouteResolverOptions["manifests"],
    });
    expect((await resolver.resolve("site-a", "catalog"))!.selection.installationId).toBe("install-a");
    expect(payloadReads).toBe(1);
    await resolver.resolve("site-a", "catalog");
    expect(payloadReads).toBe(1);
    expect(requested.slice(-2)).toEqual([["install-a"], ["install-a"]]);
    state = {
        ...state,
        selections: {
            ...state.selections!,
            revision: 2,
            plan: { ...state.selections!.plan, selections: [second.selection] },
        },
    };
    expect((await resolver.resolve("site-a", "catalog"))!.selection.installationId).toBe("install-b");
    expect(payloadReads).toBe(2);
    expect(requested.slice(-2)).toEqual([["install-a"], ["install-b"]]);
    await resolver.resolve("site-a", "catalog");
    expect(payloadReads).toBe(2);
    expect(requested.slice(-2)).toEqual([["install-b"], ["install-b"]]);
});
