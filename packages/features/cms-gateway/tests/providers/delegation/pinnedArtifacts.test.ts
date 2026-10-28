import { expect, test } from "bun:test";
import { CatalogueGatewayRouteResolver, type CatalogueGatewayRouteResolverOptions } from "@bernouy/cms-gateway";
import { GatewayPinnedArtifacts } from "cms-gateway/invocation/core/dispatch/GatewayPinnedArtifacts";
import { gatewayRoute } from "../../fixtures";

test("warm execution pins avoid catalogue reads while installation, grant and metadata views stay live", async () => {
    const f = await gatewayRoute();
    let installation = f.installation;
    let current = { revision: 1, plan: { selections: [f.selection] } };
    let releaseReads = 0;
    let manifestReads = 0;
    let selectionReads = 0;
    let installationReads = 0;
    let release = f.release;
    const resolver = new CatalogueGatewayRouteResolver({
        selections: {
            get: async () => {
                selectionReads++;
                return current;
            },
        },
        installations: {
            get: async () => {
                installationReads++;
                return installation;
            },
        },
        releases: {
            get: async () => {
                releaseReads++;
                return release;
            },
        },
        manifests: {
            findByDigest: async () => {
                manifestReads++;
                return f.manifest;
            },
        },
    } as unknown as CatalogueGatewayRouteResolverOptions);
    const original = await resolver.resolve("site-a", "catalog");
    await resolver.resolve("site-a", "catalog");
    expect(releaseReads).toBe(1);
    expect(manifestReads).toBe(1);
    expect(selectionReads).toBe(4);
    expect(installationReads).toBe(4);
    // Yank is a catalogue discovery signal; it does not revoke an already approved installation.
    release = { ...release, yank: { reason: "Withdrawn from discovery" } };
    expect((await resolver.describe("site-a", "catalog"))?.yank?.reason).toBe("Withdrawn from discovery");
    expect(releaseReads).toBe(2);
    installation = { ...installation, installation: { ...installation.installation, status: "disabled" } };
    expect(await resolver.isCurrent(original!)).toBe(false);
    current = { revision: 2, plan: { selections: [] } };
    expect(await resolver.resolve("site-a", "catalog")).toBeNull();
    expect(releaseReads).toBe(2);
});

test("pinned artifacts are isolated by catalogue owner, reject wrong identities and retry failed loads", async () => {
    const f = await gatewayRoute();
    let available = false;
    let reads = 0;
    const releases = {
        get: async () => {
            reads++;
            return available ? f.release : null;
        },
    } as never;
    const manifests = { findByDigest: async () => f.manifest } as never;
    const cache = new GatewayPinnedArtifacts(releases, manifests);
    await expect(cache.contract(f.selection)).rejects.toMatchObject({ code: "invalid_route" });
    available = true;
    await Promise.all([cache.contract(f.selection), cache.contract(f.selection)]);
    expect(reads).toBe(2);
    await expect(cache.contract({ ...f.selection, contractId: "other-contract" })).rejects.toMatchObject({
        code: "invalid_route",
    });
    const foreign = new GatewayPinnedArtifacts({ get: async () => null } as never, manifests);
    await expect(foreign.contract(f.selection)).rejects.toMatchObject({ code: "invalid_route" });
    const missingManifest = new GatewayPinnedArtifacts(releases, { findByDigest: async () => null } as never);
    await expect(missingManifest.manifest(f.manifest.admission.digest)).rejects.toMatchObject({
        code: "invalid_route",
    });
});

test("a selection and approval change loads the new exact artifacts instead of following a cached route", async () => {
    const first = await gatewayRoute();
    const second = await gatewayRoute({ capabilityId: "item.changed" });
    let active = first;
    let revision = 1;
    let contracts = 0;
    let manifests = 0;
    const resolver = new CatalogueGatewayRouteResolver({
        selections: { get: async () => ({ revision, plan: { selections: [active.selection] } }) },
        installations: { get: async () => active.installation },
        releases: {
            get: async () => {
                contracts++;
                return active.release;
            },
        },
        manifests: {
            findByDigest: async () => {
                manifests++;
                return active.manifest;
            },
        },
    } as unknown as CatalogueGatewayRouteResolverOptions);
    const old = await resolver.resolve("site-a", "catalog");
    active = second;
    revision++;
    expect(await resolver.isCurrent(old!)).toBe(false);
    const updated = await resolver.resolve("site-a", "catalog");
    expect(updated?.release.admission.digest).toBe(second.release.admission.digest);
    expect(updated?.manifest.admission.digest).toBe(second.manifest.admission.digest);
    expect(contracts).toBe(2);
    expect(manifests).toBe(2);
});
