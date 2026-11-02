import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import { admitContractBundleJson, parseContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import type { ProviderRepositorySource, RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";

const ROOT = resolve(import.meta.dir, "../../../../ulvia-cli/dist/bootstrap");

export async function repositoryFixture() {
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
        index.contracts.map(async (path) => {
            const bytes = await readFile(resolve(ROOT, path));
            const metadata = parseContractReleaseJson(bytes);
            return admitContractBundleJson(
                bytes,
                await Promise.all(
                    (metadata.documentation ?? []).map(async (document) => ({
                        id: `docs/${document.path}`,
                        bytes: await readFile(resolve(ROOT, dirname(path), "docs", document.path)),
                    })),
                ),
            );
        }),
    );
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
        getAsset: async (reference, id) => {
            const asset = admissions
                .find((entry) => entry.digest === reference.digest)
                ?.documentationAssets?.find((entry) => entry.id === id);
            if (!asset) {
                throw new Error("Missing fixture documentation");
            }
            return new Uint8Array(await asset.bytes.arrayBuffer());
        },
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
        get: async () => ({
            release: collectionValue,
            assets: collectionAssets,
        }),
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
