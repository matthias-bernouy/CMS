import { expect, test } from "bun:test";
import {
    CapabilityGateway,
    CatalogueGatewayRouteResolver,
    SelectedGatewayCatalogue,
    type CatalogueGatewayRouteResolverOptions,
} from "@bernouy/cms-gateway";
import { gatewayRoute, NOW } from "../fixtures";
import { InMemoryGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";

test("catalogue resolver fences selected policy changes without scanning unrelated catalogues", async () => {
    const fixture = await gatewayRoute();
    let selected = fixture.selection;
    let installation = fixture.installation;
    let changeDuringLookup = false;
    const selections = {
        get: async () => ({
            siteId: "site-a",
            revision: 1,
            dependencyRevision: "deps-0",
            plan: {
                siteId: "site-a",
                selections: [selected],
                dependencies: [],
                structurallyValid: true,
                runtimeReadiness: "not-evaluated",
            },
        }),
    } as unknown as CatalogueGatewayRouteResolverOptions["selections"];
    const resolver = new CatalogueGatewayRouteResolver({
        selections,
        installations: {
            get: async () => {
                if (changeDuringLookup) {
                    selected = { ...fixture.selection, installationId: "install-b" };
                }
                return installation;
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
    selected = { ...fixture.selection, installationId: "install-b" };
    expect(await resolver.isCurrent(route!)).toBe(false);
    selected = fixture.selection;
    expect(await resolver.isCurrent(route!)).toBe(true);
    installation = {
        ...fixture.installation,
        revision: fixture.installation.revision + 1,
        observation: { ...fixture.installation.observation!, observedAt: "2026-09-29T08:00:20.000Z" },
    };
    expect(await resolver.isCurrent(route!)).toBe(true);
    installation = {
        ...installation,
        observation: {
            ...installation.observation!,
            report: {
                ...installation.observation!.report,
                implementations: installation.observation!.report.implementations.map((item) => ({
                    ...item,
                    status: "unavailable" as const,
                })),
            },
        },
    };
    expect(await resolver.isCurrent(route!)).toBe(false);
    installation = fixture.installation;
    changeDuringLookup = true;
    await expect(resolver.resolve("site-a", "catalog")).rejects.toMatchObject({ code: "stale_route" });
});

test("fresh observation renewal does not make a completed command uncertain", async () => {
    const fixture = await gatewayRoute({ behavior: { effect: "command", execution: "sync", idempotency: "none" } });
    let installation = fixture.installation;
    const routes = new CatalogueGatewayRouteResolver({
        selections: { get: async () => ({ plan: { selections: [fixture.selection] } }) } as never,
        installations: { get: async () => installation } as never,
        releases: { get: async () => fixture.release } as never,
        manifests: { findByDigest: async () => fixture.manifest } as never,
    });
    const gateway = new CapabilityGateway({
        routes,
        transport: {
            send: async () => {
                installation = {
                    ...installation,
                    revision: installation.revision + 1,
                    observation: { ...installation.observation!, observedAt: "2026-09-29T08:00:20.000Z" },
                };
                return { status: 200, contentType: "application/json", output: { items: ["saved"] } };
            },
        },
        authorize: async () => true,
        commandAudit: new InMemoryGatewayCommandAuditStore(),
        now: () => NOW,
    });
    await expect(
        gateway.invoke({
            siteId: "site-a",
            contractId: "catalog",
            capabilityId: "item.list",
            actor: { kind: "anonymous" },
            origin: "delivery",
            input: { term: "one" },
        }),
    ).resolves.toMatchObject({ kind: "success", output: { items: ["saved"] } });
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
        { now: () => NOW },
    );
    expect(await catalogue.list("site-a")).toMatchObject([
        { contractId: "catalog", contractLabel: "Catalog", capabilityId: "item.list", providerId: "ulvia.example" },
    ]);

    const command = await gatewayRoute({ behavior: { effect: "command", execution: "sync", idempotency: "natural" } });
    const commandCatalogue = new SelectedGatewayCatalogue(
        { get: async () => ({ plan: { selections: [command.selection] } }) } as unknown as ConstructorParameters<
            typeof SelectedGatewayCatalogue
        >[0],
        { resolve: async () => command, isCurrent: async () => true },
        { now: () => NOW },
    );
    expect(await commandCatalogue.list("site-a")).toHaveLength(1);

    for (const excluded of [
        { access: "admin" },
        { behavior: { effect: "command", execution: "sync", idempotency: "keyed" } },
        { binary: true },
    ]) {
        const route = await gatewayRoute(excluded);
        const filtered = new SelectedGatewayCatalogue(
            { get: async () => ({ plan: { selections: [route.selection] } }) } as unknown as ConstructorParameters<
                typeof SelectedGatewayCatalogue
            >[0],
            { resolve: async () => route, isCurrent: async () => true },
            { now: () => NOW },
        );
        expect(await filtered.list("site-a")).toEqual([]);
    }
});

test("editor catalogue hides disabled and stale provider routes", async () => {
    const fixture = await gatewayRoute();
    let current = fixture;
    const catalogue = new SelectedGatewayCatalogue(
        { get: async () => ({ plan: { selections: [fixture.selection] } }) } as never,
        { resolve: async () => current, isCurrent: async () => true },
        { now: () => NOW },
    );
    expect(await catalogue.list("site-a")).toHaveLength(1);
    current = {
        ...fixture,
        installation: {
            ...fixture.installation,
            installation: { ...fixture.installation.installation, status: "disabled" },
        },
    };
    expect(await catalogue.list("site-a")).toEqual([]);
    current = fixture;
    const stale = new SelectedGatewayCatalogue(
        { get: async () => ({ plan: { selections: [fixture.selection] } }) } as never,
        { resolve: async () => current, isCurrent: async () => true },
        { now: () => "2026-09-29T08:01:01.000Z" },
    );
    expect(await stale.list("site-a")).toEqual([]);
});

test("collection requirements report selected provider grants as ready, missing, or degraded", async () => {
    const fixture = await gatewayRoute({ access: "admin" });
    let current = fixture;
    const catalogue = new SelectedGatewayCatalogue(
        { get: async () => ({ plan: { selections: [fixture.selection] } }) } as never,
        {
            resolve: async (_siteId, contractId) => (contractId === "catalog" ? current : null),
            isCurrent: async () => true,
        },
        { now: () => NOW },
    );
    const requirements = [
        { contractId: "catalog", capabilityId: "item.list", versionRange: "^1.0.0" },
        { contractId: "missing", capabilityId: "item.list", versionRange: "^1.0.0" },
        { contractId: "catalog", capabilityId: "item.list", versionRange: "^2.0.0" },
    ];

    expect((await catalogue.checkRequirements("site-a", requirements)).map((item) => item.status)).toEqual([
        "ready",
        "missing",
        "missing",
    ]);
    current = {
        ...fixture,
        installation: {
            ...fixture.installation,
            installation: { ...fixture.installation.installation, status: "disabled" },
        },
    };
    expect((await catalogue.checkRequirements("site-a", [requirements[0]!]))[0]).toMatchObject({
        status: "degraded",
        installationId: "install-a",
        selectedVersion: "1.0.0",
    });
});
