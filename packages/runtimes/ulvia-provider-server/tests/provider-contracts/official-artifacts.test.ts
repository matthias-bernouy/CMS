import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import type { ProviderRepositorySource, RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import { loadOfficialArtifacts } from "../../src/runtime/instances/officialArtifacts";

const ROOT = resolve(import.meta.dir, "../../../ulvia-cli/dist/bootstrap");

test("builds the official profile from verified repository releases", async () => {
    const fixture = await repositoryFixture();
    const loaded = await loadOfficialArtifacts(fixture.providers, fixture.collections);

    expect(loaded.profile.manifest.digest).toBe(fixture.manifestDigest);
    expect(loaded.profile.collection.digest).toBe(fixture.collectionDigest);
    expect(loaded.profile.contracts).toEqual(
        loaded.contracts.map((release) => ({
            contractId: release.contractId,
            version: release.version,
            digest: fixture.contractDigests.get(release.contractId),
        })),
    );
});

test("rejects repository metadata that does not match the official bytes", async () => {
    const fixture = await repositoryFixture();
    const providers: ProviderRepositorySource = {
        ...fixture.providers,
        list: async (kind) =>
            (await fixture.providers.list(kind)).map((entry) =>
                kind === "provider-manifest" ? { ...entry, digest: `sha256:${"0".repeat(64)}` } : entry,
            ),
    };

    await expect(loadOfficialArtifacts(providers, fixture.collections)).rejects.toThrow("digest mismatch");
});

async function repositoryFixture() {
    const index = JSON.parse(await readFile(resolve(ROOT, "index.json"), "utf8")) as {
        contracts: string[];
        provider: string;
        collection: string;
        collectionAssets: Array<{ id: string; path: string }>;
    };
    const catalogue = new InMemoryReleaseCatalogue();
    const entries: RepositoryArtifactEntry[] = [];
    const bytes = new Map<string, Uint8Array>();
    const contractDigests = new Map<string, string>();
    const admissions = [];
    for (const path of index.contracts) {
        const source = await readFile(resolve(ROOT, path));
        const admission = await admitContractReleaseJson(source);
        admissions.push(admission);
        contractDigests.set(admission.release.contractId, admission.digest);
        entries.push({
            repositoryId: "official",
            kind: "contract",
            publisherId: admission.release.publisherId,
            id: admission.release.contractId,
            version: admission.release.version,
            digest: admission.digest,
            name: admission.release.name,
        });
        bytes.set(`contract:${admission.release.contractId}`, source);
    }
    await publishContractSet(catalogue, admissions);
    const manifestBytes = await readFile(resolve(ROOT, index.provider));
    const manifest = await admitProviderManifestJson(manifestBytes, catalogue);
    entries.push({
        repositoryId: "official",
        kind: "provider-manifest",
        publisherId: manifest.manifest.provenance.publisherId,
        id: manifest.manifest.providerId,
        version: manifest.manifest.version,
        digest: manifest.digest,
        name: manifest.manifest.name,
    });
    bytes.set(`provider-manifest:${manifest.manifest.providerId}`, manifestBytes);
    const collectionValue = JSON.parse(await readFile(resolve(ROOT, index.collection), "utf8"));
    const collectionAssets = await Promise.all(
        index.collectionAssets.map(async ({ id, path }) => ({ id, bytes: await readFile(resolve(ROOT, path)) })),
    );
    const collection = await admitCollectionRelease(collectionValue, collectionAssets, { contracts: catalogue });
    const providers: ProviderRepositorySource = {
        id: "official",
        list: async (kind) => entries.filter((entry) => entry.kind === kind),
        get: async (reference) => bytes.get(`${reference.kind}:${reference.id}`)!,
    };
    const collections: CollectionRepositorySource = {
        id: "official",
        list: async () => [
            {
                repositoryId: "official",
                publisherId: collection.release.publisherId,
                collectionId: collection.release.collectionId,
                version: collection.release.version,
                digest: collection.digest,
                name: collection.release.name,
                description: collection.release.description,
                blocCount: collection.release.blocs.length,
                hasTheme: collection.release.theme !== undefined,
            },
        ],
        get: async () => ({ release: collectionValue, assets: collectionAssets }),
    };
    return {
        providers,
        collections,
        manifestDigest: manifest.digest,
        collectionDigest: collection.digest,
        contractDigests,
    };
}
