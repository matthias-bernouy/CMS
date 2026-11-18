import { expect, test } from "bun:test";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { InMemoryProviderManifestCatalogue } from "@bernouy/repository/providers/catalogue";
import {
    InMemoryProviderInstallationStore,
    ProviderInstallationLifecycle,
} from "@bernouy/repository/providers/installations";
import { secretKeyToRef } from "@bernouy/secret-store";
import { catalogueContract } from "../resources/contract";
import { catalogueProvider } from "../resources/provider";
import { decodeMetadataSeed, metadataConnectionSecretRef } from "../state/seed";
import { metadataFixtureScope } from "../state/scope";

test("real metadata fixtures admit sixty-four independent documents and retain exact old/new contract implementations", async () => {
    const releases = new InMemoryReleaseCatalogue();
    const large = await catalogueContract("performance-metadata", 0, true);
    expect(large.documents).toHaveLength(64);
    expect(large.assets.reduce((sum, row) => sum + row.bytes.byteLength, 0)).toBeGreaterThan(256 * 1024);
    expect(new Set(large.documents.map((row) => row.path)).size).toBe(64);
    expect(large.admission.release.capabilities).toHaveLength(64);
    await expect(catalogueContract("performance-metadata", 128, false)).rejects.toThrow("bound");
    const first = await catalogueContract("performance-metadata", 0, false);
    const next = await catalogueContract("performance-metadata", 1, false);
    expect(first.documents[0]!.content.length).toBeGreaterThan(16384);
    expect(first.digest).not.toBe(next.digest);
    await releases.publish(first.admission);
    await releases.publish(next.admission);
    const original = await catalogueProvider("performance-metadata", 0, 0, [first], releases);
    const retained = await catalogueProvider("performance-metadata", 0, 1, [first, next], releases);
    expect(retained.admission.manifest.implementations.map((row) => row.digest)).toEqual([first.digest, next.digest]);
    const manifests = new InMemoryProviderManifestCatalogue(releases);
    await manifests.publish(original.admission);
    await manifests.publish(retained.admission);
    const clock = () => new Date().toISOString();
    const store = new InMemoryProviderInstallationStore(manifests, clock);
    const lifecycle = new ProviderInstallationLifecycle(store, manifests, clock);
    const report = (resource: typeof original) => ({
        protocol: "ulvia-provider/v1",
        providerId: resource.id,
        instanceId: "instance:00000000-0000-4000-8000-000000000001",
        account: { id: "owned-account", label: "Controlled fixture" },
        buildVersion: "1.0.0",
        manifest: { version: resource.version, digest: resource.digest },
        implementations: resource.admission.manifest.implementations.map(({ contractId, version, digest }) => ({
            contractId,
            version,
            digest,
            status: "ready",
        })),
    });
    await expect(
        lifecycle.prepare(
            {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                siteId: "default",
                providerId: original.id,
                accountId: "owned-account",
                endpoint: "http://ulvia-provider:5103",
                manifestVersion: original.version,
                manifestDigest: original.digest,
                providerTokenRef: secretKeyToRef("PERFORMANCE_METADATA_aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa"),
                configuration: {},
            },
            report(original),
        ),
    ).rejects.toThrow("exact secret reference");
    expect(metadataConnectionSecretRef("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toMatch(/^\$\{[A-Z][A-Z0-9_]*\}$/u);
    expect(() => metadataConnectionSecretRef("outside-owned-id")).toThrow("connection-id");
    const prepared = await lifecycle.prepare(
        {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            siteId: "default",
            providerId: original.id,
            accountId: "owned-account",
            endpoint: "http://ulvia-provider:5103",
            manifestVersion: original.version,
            manifestDigest: original.digest,
            providerTokenRef: metadataConnectionSecretRef("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
            configuration: {},
        },
        report(original),
    );
    const installed = await lifecycle.approve(prepared, "owned-administrator");
    expect(installed.revision).toBe(1);
    const observed = await lifecycle.observe(
        { siteId: "default", installationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        installed.revision,
        report(original),
    );
    expect(observed.revision).toBe(2);
    const update = await lifecycle.prepareModification(
        { siteId: "default", installationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        observed.revision,
        { manifestVersion: retained.version, manifestDigest: retained.digest },
        report(retained),
    );
    const modified = await lifecycle.modify(update, "owned-administrator");
    expect(modified.revision).toBe(3);
    const latest = await lifecycle.observe(
        { siteId: "default", installationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        modified.revision,
        report(retained),
    );
    expect(latest.revision).toBe(4);
    expect(latest.observation?.report.implementations).toHaveLength(2);
    expect(await store.get({ siteId: "foreign", installationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).toBeNull();
});

test("metadata fixture storage and credential lookup refuse production, main and foreign-stack targets", () => {
    const stack = { id: "ulvia-mcp-aabbccdd", providerName: "ulvia-mcp-aabbccdd-provider" };
    const site = {
        url: "http://perf-flow-0123456789abcdef01234567.localhost:3000",
        instanceId: "instance:00000000-0000-4000-8000-000000000001",
    };
    expect(metadataFixtureScope(stack, site, "http://main.localhost:3000")).toBe(
        "ulvia-mcp-aabbccdd-perf-flow-0123456789abcdef01234567",
    );
    for (const url of [
        "https://ulvia.fr",
        "http://main.localhost:3000",
        "http://perf-flow-0123456789abcdef01234567.localhost:3001",
        `${site.url}/path`,
        `http://private:token@perf-flow-0123456789abcdef01234567.localhost:3000`,
    ]) {
        expect(() => metadataFixtureScope(stack, { ...site, url }, "http://main.localhost:3000")).toThrow();
    }
    expect(() =>
        metadataFixtureScope({ ...stack, providerName: "foreign-provider" }, site, "http://main.localhost:3000"),
    ).toThrow();
});

test("metadata worker domain refusals never become accepted fixture data and do not expose exception messages", () => {
    const value = {
        failure: { phase: "observe", code: "identity_mismatch", processed: 0, message: "Bearer private-example-token" },
    };
    expect(() => decodeMetadataSeed(value, [])).toThrow("metadata-fixture-worker-observe-identity_mismatch");
    try {
        decodeMetadataSeed(value, []);
    } catch (error) {
        expect(String(error)).not.toContain("private-example-token");
    }
    expect(() =>
        decodeMetadataSeed({ failure: { phase: "unsafe message text", code: "Bearer private-example-token" } }, []),
    ).toThrow("metadata-fixture-worker-internal-internal");
});
