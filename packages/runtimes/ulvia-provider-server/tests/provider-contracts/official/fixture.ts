import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import { admitContractBundleJson, parseContractReleaseJson } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/ulvia-providers";
import type { ProviderRepositorySource, RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";

const ROOT = resolve(import.meta.dir, "../../../../ulvia-cli/dist/bootstrap");

export async function repositoryFixture() {
    const index = JSON.parse(await readFile(resolve(ROOT, "index.json"), "utf8")) as {
        contracts: string[];
        provider: string;
        collections: Array<{ release: string; assets: Array<{ id: string; path: string }> }>;
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
    const admittedCollections = await Promise.all(
        index.collections.map(async (entry) => {
            const release = JSON.parse(await readFile(resolve(ROOT, entry.release), "utf8"));
            const assets = await Promise.all(
                entry.assets.map(async ({ id, path }) => ({ id, bytes: await readFile(resolve(ROOT, path)) })),
            );
            return {
                admission: await admitCollectionRelease(release, assets, { contracts: catalogue }),
                release,
                assets,
            };
        }),
    );
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
        list: async () =>
            admittedCollections.map(({ admission: collection }) => ({
                repositoryId: "official",
                publisherId: collection.release.publisherId,
                collectionId: collection.release.collectionId,
                version: collection.release.version,
                digest: collection.digest,
                name: collection.release.name,
                description: collection.release.description,
                blocCount: collection.release.blocs.length,
                hasTheme: collection.release.theme !== undefined,
            })),
        getMetadata: async (entry) =>
            admittedCollections.find(({ admission }) => admission.digest === entry.digest)!.release,
        get: async (entry) => {
            const { release, assets } = admittedCollections.find(({ admission }) => admission.digest === entry.digest)!;
            return { release, assets };
        },
    };
    return {
        providers,
        collections,
        catalogue,
        contracts: admissions,
        manifestDigest: manifest.digest,
        collectionDigest: admittedCollections.find(({ admission }) => admission.release.collectionId === "ulvia/mossa")!
            .admission.digest,
        contractDigests,
    };
}
