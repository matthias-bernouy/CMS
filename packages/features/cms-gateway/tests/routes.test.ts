import { expect, test } from "bun:test";
import {
    CatalogueGatewayRevisionSource,
    CatalogueGatewayRouteResolver,
    SelectedGatewayCatalogue,
    type CatalogueGatewayRouteResolverOptions,
} from "@bernouy/cms-gateway";
import { gatewayRoute } from "./fixtures";

test("catalogue resolver loads exact site pins and fences changing route state", async () => {
    const fixture = await gatewayRoute();
    let routeRevision = "route-1";
    let changeDuringLookup = false;
    const selections = {
        get: async () => ({
            siteId: "site-a",
            revision: 1,
            dependencyRevision: "deps-0",
            plan: {
                siteId: "site-a",
                selections: [fixture.selection],
                dependencies: [],
                structurallyValid: true,
                runtimeReadiness: "not-evaluated",
            },
        }),
    } as unknown as CatalogueGatewayRouteResolverOptions["selections"];
    const resolver = new CatalogueGatewayRouteResolver({
        selections,
        revisions: {
            capture: async () => routeRevision,
            isCurrent: async (_siteId, revision) => routeRevision === revision,
        },
        installations: {
            get: async () => {
                if (changeDuringLookup) {
                    routeRevision = "route-2";
                }
                return fixture.installation;
            },
        } as unknown as CatalogueGatewayRouteResolverOptions["installations"],
        releases: {
            get: async () => fixture.release,
        } as unknown as CatalogueGatewayRouteResolverOptions["releases"],
        manifests: {
            findByDigest: async () => fixture.manifest,
        } as unknown as CatalogueGatewayRouteResolverOptions["manifests"],
    });
    const route = await resolver.resolve("site-a", "catalog");
    expect(route).toMatchObject({ selection: fixture.selection, release: fixture.release });
    expect(await resolver.isCurrent(route!)).toBe(true);
    routeRevision = "route-2";
    expect(await resolver.isCurrent(route!)).toBe(false);
    routeRevision = "route-1";
    expect(await resolver.isCurrent(route!)).toBe(true);
    changeDuringLookup = true;
    await expect(resolver.resolve("site-a", "catalog")).rejects.toMatchObject({ code: "stale_route" });
});

test("gateway revision fences selection and catalogue changes", async () => {
    let selectionRevision = 1;
    let dependencyRevision = "dependencies-1";
    const revisionSource = new CatalogueGatewayRevisionSource(
        { get: async () => ({ revision: selectionRevision }) } as unknown as ConstructorParameters<
            typeof CatalogueGatewayRevisionSource
        >[0],
        {
            capture: async () => ({ revision: dependencyRevision }),
            isCurrent: async (_siteId, revision) => revision === dependencyRevision,
        } as unknown as ConstructorParameters<typeof CatalogueGatewayRevisionSource>[1],
    );
    const original = await revisionSource.capture("site-a");
    expect(await revisionSource.isCurrent("site-a", original)).toBe(true);
    selectionRevision += 1;
    expect(await revisionSource.isCurrent("site-a", original)).toBe(false);
    const afterSelection = await revisionSource.capture("site-a");
    dependencyRevision = "dependencies-2";
    expect(await revisionSource.isCurrent("site-a", afterSelection)).toBe(false);
    expect(await revisionSource.isCurrent("site-a", "invalid")).toBe(false);
});

test("editor catalogue includes only callable selected query capabilities", async () => {
    const fixture = await gatewayRoute();
    const catalogue = new SelectedGatewayCatalogue(
        {
            get: async () => ({
                plan: { selections: [fixture.selection] },
            }),
        } as unknown as ConstructorParameters<typeof SelectedGatewayCatalogue>[0],
        {
            resolve: async (siteId, contractId) => (siteId === "site-a" && contractId === "catalog" ? fixture : null),
            isCurrent: async () => true,
        },
    );
    expect(await catalogue.list("site-a")).toMatchObject([
        { contractId: "catalog", contractLabel: "Catalog", capabilityId: "item.list", providerId: "ulvia.example" },
    ]);

    for (const excluded of [
        { access: "admin" },
        { behavior: { effect: "command", execution: "sync", idempotency: "natural" } },
        { binary: true },
    ]) {
        const route = await gatewayRoute(excluded);
        const filtered = new SelectedGatewayCatalogue(
            { get: async () => ({ plan: { selections: [route.selection] } }) } as unknown as ConstructorParameters<
                typeof SelectedGatewayCatalogue
            >[0],
            { resolve: async () => route, isCurrent: async () => true },
        );
        expect(await filtered.list("site-a")).toEqual([]);
    }
});
