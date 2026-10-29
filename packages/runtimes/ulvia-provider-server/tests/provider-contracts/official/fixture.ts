import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import type { ProviderRepositorySource, RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";

const ROOT = resolve(import.meta.dir, "../../../../ulvia-cli/dist/bootstrap");

export async function repositoryFixture(includePrevious = false) {
    const index = JSON.parse(await readFile(resolve(ROOT, "index.json"), "utf8")) as {
        contracts: string[];
        provider: string;
        collection: string;
        collectionAssets: Array<{ id: string; path: string }>;
    };
    const catalogue = new InMemoryReleaseCatalogue();
    const entries: RepositoryArtifactEntry[] = [];
    const bytes = new Map<string, Uint8Array>();
    const admissions = await Promise.all(
        index.contracts.map(async (path) => admitContractReleaseJson(await readFile(resolve(ROOT, path)))),
    );
    if (includePrevious) {
        const current = admissions.find(({ release }) => release.contractId === "ulvia.cms.observability")!;
        const previous = JSON.parse(current.canonicalJson);
        previous.version = "1.0.0";
        for (const capability of previous.capabilities) {
            capability.bindings = capability.bindings.filter(
                (binding: { transport: string }) => binding.transport !== "mcp",
            );
        }
        admissions.unshift(await admitContractReleaseJson(JSON.stringify(previous)));
        const installations = JSON.parse(
            admissions.find(({ release }) => release.contractId === "ulvia.cms.installations")!.canonicalJson,
        );
        installations.version = "1.0.0";
        installations.capabilities = installations.capabilities.filter(
            (capability: { id: string }) => capability.id !== "gateway.dispatch.prepare",
        );
        admissions.unshift(await admitContractReleaseJson(JSON.stringify(installations)));
    }
    const contractDigests = new Map(admissions.map(({ release, digest }) => [release.contractId, digest]));
    await publishContractSet(catalogue, admissions);
    for (const admission of admissions) {
        entries.push({
            repositoryId: "official",
            kind: "contract",
            publisherId: admission.release.publisherId,
            id: admission.release.contractId,
            version: admission.release.version,
            digest: admission.digest,
            name: admission.release.name,
        });
        bytes.set(
            `contract:${admission.release.contractId}@${admission.release.version}`,
            Buffer.from(admission.canonicalJson),
        );
    }
    const manifestBytes = await readFile(resolve(ROOT, index.provider));
    const manifest = await admitProviderManifestJson(manifestBytes, catalogue);
    const manifests = [manifest];
    if (includePrevious) {
        const previous = JSON.parse(manifest.canonicalJson);
        previous.version = "0.1.0";
        const old = admissions.find(
            ({ release }) => release.contractId === "ulvia.cms.observability" && release.version === "1.0.0",
        )!;
        const oldInstallations = admissions.find(
            ({ release }) => release.contractId === "ulvia.cms.installations" && release.version === "1.0.0",
        )!;
        const intermediate = JSON.parse(manifest.canonicalJson);
        intermediate.version = "0.2.0";
        intermediate.implementations = intermediate.implementations.map((pin: { contractId: string }) =>
            pin.contractId === oldInstallations.release.contractId
                ? { ...pin, version: "1.0.0", digest: oldInstallations.digest }
                : pin,
        );
        manifests.push(await admitProviderManifestJson(JSON.stringify(intermediate), catalogue));
        previous.implementations = previous.implementations.map((pin: { contractId: string }) =>
            pin.contractId === old.release.contractId
                ? { ...pin, version: old.release.version, digest: old.digest }
                : pin.contractId === oldInstallations.release.contractId
                  ? { ...pin, version: "1.0.0", digest: oldInstallations.digest }
                  : pin,
        );
        previous.provenance.publishedAt = "2026-10-01T00:00:00Z";
        manifests.push(await admitProviderManifestJson(JSON.stringify(previous), catalogue));
    }
    for (const admitted of manifests) {
        entries.push({
            repositoryId: "official",
            kind: "provider-manifest",
            publisherId: admitted.manifest.provenance.publisherId,
            id: admitted.manifest.providerId,
            version: admitted.manifest.version,
            digest: admitted.digest,
            name: admitted.manifest.name,
        });
        bytes.set(
            `provider-manifest:${admitted.manifest.providerId}@${admitted.manifest.version}`,
            Buffer.from(admitted.canonicalJson),
        );
    }
    const collectionValue = JSON.parse(await readFile(resolve(ROOT, index.collection), "utf8"));
    const collectionAssets = await Promise.all(
        index.collectionAssets.map(async ({ id, path }) => ({ id, bytes: await readFile(resolve(ROOT, path)) })),
    );
    const collection = await admitCollectionRelease(collectionValue, collectionAssets, { contracts: catalogue });
    const providers: ProviderRepositorySource = {
        id: "official",
        list: async (kind) => entries.filter((entry) => entry.kind === kind),
        get: async (reference) => bytes.get(`${reference.kind}:${reference.id}@${reference.version}`)!,
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
        getMetadata: async () => collectionValue,
        get: async () => ({ release: collectionValue, assets: collectionAssets }),
    };
    return {
        providers,
        collections,
        catalogue,
        contracts: admissions,
        manifestDigest: manifest.digest,
        collectionDigest: collection.digest,
        contractDigests,
    };
}
