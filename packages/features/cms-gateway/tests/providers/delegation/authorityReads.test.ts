import { expect, test } from "bun:test";
import {
    GatewayAuthorityReads,
    CatalogueGatewayRouteResolver,
    type CatalogueGatewayRouteResolverOptions,
} from "@bernouy/cms-gateway";
import { gatewayRoute } from "../../fixtures";

test("initial reads deduplicate by store identity, remain operation-local, and cannot serve a final fence", async () => {
    const fixture = await gatewayRoute();
    let installation = fixture.installation;
    let selectionReads = 0;
    let installationReads = 0;
    const selections = {
        get: async () => {
            selectionReads++;
            return { plan: { selections: [fixture.selection] } };
        },
    } as unknown as CatalogueGatewayRouteResolverOptions["selections"];
    const installations = {
        get: async () => {
            installationReads++;
            return installation;
        },
    } as unknown as CatalogueGatewayRouteResolverOptions["installations"];
    const resolver = new CatalogueGatewayRouteResolver({
        selections,
        installations,
        releases: { get: async () => fixture.release } as unknown as CatalogueGatewayRouteResolverOptions["releases"],
        manifests: {
            findByDigest: async () => fixture.manifest,
        } as unknown as CatalogueGatewayRouteResolverOptions["manifests"],
    });
    const reads = new GatewayAuthorityReads("site-a");
    const [a, b] = await Promise.all([
        resolver.resolve("site-a", "catalog", reads),
        resolver.resolve("site-a", "catalog", reads),
    ]);
    expect(a).toBe(b);
    expect(selectionReads).toBe(1);
    expect(installationReads).toBe(1);
    await reads.selection(selections, "site-a");
    await reads.installation(installations, "site-a", "install-a");
    expect(selectionReads).toBe(1);
    expect(installationReads).toBe(1);
    installation = { ...installation, installation: { ...installation.installation, status: "disabled" } };
    expect(await resolver.isCurrent(a!)).toBe(false);
    expect(selectionReads).toBe(2);
    expect(installationReads).toBe(2);
    const next = await resolver.resolve("site-a", "catalog", new GatewayAuthorityReads("site-a"));
    expect(next!.installation.installation.status).toBe("disabled");
    expect(selectionReads).toBe(3);
});

test("equally named sites from different stores never share authority and failed reads can be retried", async () => {
    const reads = new GatewayAuthorityReads("default");
    let attempts = 0;
    const a = {
        get: async () => {
            if (++attempts === 1) {
                throw new Error("unavailable");
            }
            return { revision: 1 };
        },
    } as never;
    const b = { get: async () => ({ revision: 2 }) } as never;
    await expect(reads.selection(a, "default")).rejects.toThrow("unavailable");
    expect(await reads.selection(a, "default")).toMatchObject({ revision: 1 });
    expect(await reads.selection(b, "default")).toMatchObject({ revision: 2 });
    expect(() => reads.selection(a, "another-site")).toThrow("another site");
    reads.clear();
    await reads.selection(a, "default");
    expect(attempts).toBe(3);
});

test("capability metadata avoids transport stores and fences a concurrent selection change", async () => {
    const f = await gatewayRoute();
    let revision = 1;
    let change = false;
    const resolver = new CatalogueGatewayRouteResolver({
        selections: {
            get: async () => ({ revision, plan: { selections: [f.selection] } }),
        } as unknown as CatalogueGatewayRouteResolverOptions["selections"],
        releases: {
            get: async () => {
                if (change) {
                    revision++;
                }
                return f.release;
            },
        } as unknown as CatalogueGatewayRouteResolverOptions["releases"],
        installations: {
            get: async () => {
                throw new Error("Metadata must not load an installation");
            },
        } as unknown as CatalogueGatewayRouteResolverOptions["installations"],
        manifests: {
            findByDigest: async () => {
                throw new Error("Metadata must not load a manifest");
            },
        } as unknown as CatalogueGatewayRouteResolverOptions["manifests"],
    });
    expect(await resolver.describe("site-a", "catalog")).toBe(f.release);
    change = true;
    await expect(resolver.describe("site-a", "catalog")).rejects.toMatchObject({ code: "stale_route" });
});

test("captured metadata belongs to exact store objects and a final authority check reads fresh state", async () => {
    const f = await gatewayRoute();
    let snapshot = {
        selections: {
            siteId: "site-a",
            revision: 1,
            grants: { default: "allow-selected", denied: [] },
            plan: { selections: [f.selection] },
        },
        installations: [f.installation],
    };
    let captures = 0;
    const executionState = {
        read: async () => {
            captures++;
            return structuredClone(snapshot);
        },
    } as never;
    const selections = {
        get: async () => {
            throw new Error("Unexpected selection payload read");
        },
    } as never;
    const installations = {
        get: async () => {
            throw new Error("Unexpected installation payload read");
        },
    } as never;
    const reads = await GatewayAuthorityReads.capture("site-a", selections, installations, executionState, [
        "install-a",
    ]);
    const resolver = new CatalogueGatewayRouteResolver({
        selections,
        installations,
        executionState,
        releases: { get: async () => f.release } as unknown as CatalogueGatewayRouteResolverOptions["releases"],
        manifests: {
            findByDigest: async () => f.manifest,
        } as unknown as CatalogueGatewayRouteResolverOptions["manifests"],
    });
    const route = await resolver.resolve("site-a", "catalog", reads);
    expect(captures).toBe(1);
    expect(await resolver.checkAuthority(route!, "item.list")).toEqual({ current: true, granted: true });
    snapshot = {
        ...snapshot,
        installations: [{ ...f.installation, installation: { ...f.installation.installation, status: "disabled" } }],
    };
    expect(await resolver.checkAuthority(route!, "item.list")).toEqual({ current: false, granted: true });
    expect(captures).toBe(3);
    // Ordinary resolution also joins its initial metadata using the previously learned ID hint.
    snapshot = { ...snapshot, installations: [f.installation] };
    expect((await resolver.resolve("site-a", "catalog"))!.selection).toEqual(f.selection);
    expect(captures).toBe(5);
    const otherStore = { get: async () => null };
    expect(await reads.selection(otherStore, "site-a")).toBeNull();
    expect(() => reads.selection(selections, "another-site")).toThrow("another site");
    await expect(
        GatewayAuthorityReads.capture("other-site", selections, installations, executionState, ["install-a"]),
    ).rejects.toThrow("another site");
});
