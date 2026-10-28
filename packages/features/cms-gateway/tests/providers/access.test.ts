import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import { expect, test } from "bun:test";
import {
    ProviderAccess,
    providerInstallationFingerprint,
    type ProviderAccessStore,
} from "@bernouy/cms-gateway/access/providers";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import { gatewayRoute } from "../fixtures";

async function fixture() {
    const route = await gatewayRoute();
    const destination = structuredClone(route.installation);
    const source = structuredClone(destination);
    source.installation.id = "source-a";
    source.installation.gatewayTokenRef = "${RETURN_TOKEN}";
    const manifest = structuredClone(route.manifest);
    manifest.admission.manifest.implementations[0]!.requires = [
        { contractId: "catalog", capabilityId: "item.list", versionRange: "^1.0.0", optional: true },
    ];
    const credentials = new Map<
        string,
        { installationId: string; credentialRef: string; pendingUntil?: number; installationDigest?: string }
    >();
    const secrets = new Map([["${RETURN_TOKEN}", "a".repeat(64)]]);
    let remaining = 2;
    const store: ProviderAccessStore = {
        findCredential: async (hash) => credentials.get(hash) ?? null,
        registerCredential: async (hash, installationId, credentialRef) => {
            credentials.set(hash, { installationId, credentialRef });
        },
        registerPendingCredential: async (hash, value) => {
            credentials.set(hash, value);
        },
        hasPendingCredential: async (id, digest, now) =>
            [...credentials.values()].some(
                (item) =>
                    item.installationId === id && item.installationDigest === digest && (item.pendingUntil ?? 0) > now,
            ),
        consume: async () => --remaining >= 0,
    };
    const installations = {
        get: async ({ siteId, installationId }: { siteId: string; installationId: string }) =>
            siteId === "site-a"
                ? ([source, destination].find((item) => item.installation.id === installationId) ?? null)
                : null,
    } as ProviderInstallationStore;
    const manifests = { get: async () => manifest } as unknown as ProviderManifestCatalogue;
    const current = {
        plan: { selections: [{ ...route.selection, installationId: source.installation.id }] },
        grants: { default: "allow-selected", denied: [] },
    };
    const selections = { get: async () => current };
    const routes = {
        resolve: async (site: string, contract: string) =>
            site === "site-a" && contract === "catalog" ? { ...route, installation: destination } : null,
        isCurrent: async () => true,
    };
    const create = (siteId: string) =>
        new ProviderAccess({
            siteId,
            installations,
            manifests,
            store,
            selections,
            routes,
            resolveSecret: async (reference) => secrets.get(reference),
        });
    const access = create("site-a");
    const target = {
        sourceInstallationId: "source-a",
        sourceCredentialFingerprint: providerCredentialFingerprint("a".repeat(64)),
        targetInstallationId: "install-a",
        contractId: "catalog",
        capabilityId: "item.list",
        version: "1.0.0",
    };
    await access.registerCredential("source-a", "${RETURN_TOKEN}", "a".repeat(64));
    return { access, create, source, destination, manifest, target, secrets, credentials, current, route };
}

test("Provider credentials are indexed, scoped and revoked by the current installation", async () => {
    const f = await fixture();
    expect(await f.access.authenticate("a".repeat(64))).toBe("source-a");
    expect(await f.create("site-b").authenticate("a".repeat(64))).toBeNull();
    expect(await f.access.authenticate("b".repeat(64))).toBeNull();
    expect([...f.credentials.keys()][0]).not.toContain("a".repeat(64));
    f.source.installation.gatewayTokenRef = "${ROTATED}";
    f.secrets.set("${ROTATED}", "b".repeat(64));
    await f.access.registerCredential("source-a", "${ROTATED}", "b".repeat(64));
    expect(await f.access.authenticate("a".repeat(64))).toBeNull();
    expect(await f.access.authenticate("b".repeat(64))).toBe("source-a");
    f.source.installation.status = "revoked";
    expect(await f.access.authenticate("b".repeat(64))).toBeNull();
});

test("only approved manifest requires authorize exact outbound capability and compatible version", async () => {
    const f = await fixture();
    expect(await f.access.authorize(f.target)).toBe(true);
    for (const change of [
        { capabilityId: "item.delete" },
        { contractId: "another" },
        { version: "2.0.0" },
        { sourceInstallationId: "foreign" },
        { targetInstallationId: "foreign" },
    ]) {
        expect(await f.access.authorize({ ...f.target, ...change })).toBe(false);
    }
    f.manifest.admission.digest = "sha256:" + "0".repeat(64);
    expect(await f.access.authorize(f.target)).toBe(false);
});

test("Provider calls fail closed on disabled targets and byte or shared call limits", async () => {
    const f = await fixture();
    expect(await f.access.authorize(f.target, true, 4)).toBe(true);
    await expect(f.access.authorize(f.target, true, 4)).rejects.toMatchObject({ status: 429 });
    for (const size of [-1, Infinity, NaN, 0.5, 64 * 1024 * 1024 + 1]) {
        expect(await f.access.authorize(f.target, true, size)).toBe(false);
    }
    f.destination.installation.status = "disabled";
    expect(await f.access.authorize(f.target)).toBe(false);
});

test("credential handoff accepts the acknowledged new key before the active reference switch", async () => {
    const f = await fixture();
    f.secrets.set("${NEXT}", "b".repeat(64));
    await f.access.beginCredential("source-a", "${NEXT}", "b".repeat(64), providerInstallationFingerprint(f.source));
    expect(await f.access.authenticate("a".repeat(64))).toBe("source-a");
    expect(await f.access.authenticate("b".repeat(64))).toBe("source-a");
    f.source.installation.gatewayTokenRef = "${NEXT}";
    expect(await f.access.authenticate("a".repeat(64))).toBeNull();
    expect(await f.access.authenticate("b".repeat(64))).toBe("source-a");
});

test("initial handoff authority expires and cannot survive configuration changes or revocation", async () => {
    const f = await fixture();
    delete f.source.installation.gatewayTokenRef;
    f.target.sourceCredentialFingerprint = providerCredentialFingerprint("b".repeat(64));
    f.secrets.set("${NEXT}", "b".repeat(64));
    await f.access.beginCredential("source-a", "${NEXT}", "b".repeat(64), providerInstallationFingerprint(f.source));
    expect(await f.access.authenticate("b".repeat(64))).toBe("source-a");
    expect(await f.access.authorize(f.target)).toBe(true);
    for (const row of f.credentials.values()) {
        if (row.pendingUntil) {
            row.pendingUntil = 1;
        }
    }
    expect(await f.access.authenticate("b".repeat(64))).toBeNull();
    expect(await f.access.authorize(f.target)).toBe(false);
    await f.access.beginCredential("source-a", "${NEXT}", "b".repeat(64), providerInstallationFingerprint(f.source));
    f.source.installation.endpoint = "https://changed.example";
    expect(await f.access.authenticate("b".repeat(64))).toBeNull();
    f.source.installation.status = "revoked";
    expect(await f.access.authorize(f.target)).toBe(false);
});

test("unselected implementation requirements grant nothing while global requirements remain installation-wide", async () => {
    const f = await fixture();
    f.current.plan.selections = [];
    expect(await f.access.authorize(f.target)).toBe(false);
    f.manifest.admission.manifest.requires = [...f.manifest.admission.manifest.implementations[0]!.requires];
    expect(await f.access.authorize(f.target)).toBe(true);
    f.current.grants.denied.push({ contractId: "catalog", capabilityId: "item.list" });
    expect(await f.access.authorize(f.target)).toBe(false);
});
test("rotation in place invalidates the proof of a previously authenticated pending request", async () => {
    const f = await fixture();
    expect(await f.access.authorize(f.target)).toBe(true);
    f.secrets.set("${RETURN_TOKEN}", "b".repeat(64));
    expect(await f.access.authorize(f.target)).toBe(false);
    expect(await f.access.authorize({ ...f.target, sourceCredentialFingerprint: undefined }, true)).toBe(false);
});
