import { resourceName } from "@bernouy/cms-repository/contracts/protocol";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import { prepareContractSource } from "../release/authored/contract";
import { prepareCollectionRelease } from "@bernouy/cms-repository/collections/build";
import { bootstrapOfficialRepository } from "../commands/bootstrap";

export type OfficialBootstrapArtifacts = Readonly<{
    contracts: Readonly<Record<string, string>>;
    contractAssets: readonly { contractId: string; id: string; bytes: Uint8Array }[];
    provider: string;
    providerDigest: string;
    collections: readonly Readonly<{
        id: string;
        canonicalJson: string;
        assets: readonly Readonly<{ id: string; bytes: Uint8Array }>[];
    }>[];
}>;

export async function buildOfficialBootstrapArtifacts(): Promise<OfficialBootstrapArtifacts> {
    const root = resolve(import.meta.dir, "../../../../official-repository");
    const catalogue = new InMemoryReleaseCatalogue();
    const contracts: Record<string, string> = {};
    const contractAssets: { contractId: string; id: string; bytes: Uint8Array }[] = [];
    const admissions = new Map<string, AdmittedContractRelease>();
    const contractIds = await directories(join(root, "contracts"));
    for (const id of contractIds) {
        const directory = join(root, "contracts", id);
        const { admission } = await prepareContractSource(directory);
        admissions.set(`${admission.release.contractId}@${admission.release.version}`, admission);
        for (const asset of admission.documentationAssets ?? []) {
            contractAssets.push({
                contractId: admission.release.contractId,
                id: asset.id,
                bytes: new Uint8Array(await asset.bytes.arrayBuffer()),
            });
        }
    }
    const publicationOrder = await publishContractSet(catalogue, [...admissions.values()]);
    for (const admission of publicationOrder) {
        contracts[admission.release.contractId] = admission.canonicalJson;
    }
    const provider = await admitProviderManifestJson(
        await readFile(join(root, "providers", "primary-provider", "definition.json"), "utf8"),
        catalogue,
    );
    const collections = [];
    for (const id of await directories(join(root, "collections"))) {
        const collection = await prepareCollectionRelease(join(root, "collections", id), catalogue);
        if (resourceName(collection.release.collectionId) !== id) {
            throw new Error(`Official collection folder differs from its identity: ${id}`);
        }
        collections.push({
            id: collection.release.collectionId,
            canonicalJson: collection.canonicalJson,
            assets: await Promise.all(
                collection.assets.map(async ({ id, bytes }) => ({
                    id,
                    bytes: new Uint8Array(await bytes.arrayBuffer()),
                })),
            ),
        });
    }
    return {
        contracts,
        contractAssets,
        provider: provider.canonicalJson,
        providerDigest: provider.digest,
        collections,
    };
}

export async function writeOfficialBootstrapArtifacts(
    root = resolve(import.meta.dir, "../../dist/bootstrap"),
    artifacts: OfficialBootstrapArtifacts | undefined = undefined,
): Promise<void> {
    artifacts ??= await buildOfficialBootstrapArtifacts();
    await rm(root, { recursive: true, force: true });
    const contractPaths: string[] = [];
    for (const [id, bytes] of Object.entries(artifacts.contracts)) {
        const path = id.startsWith("ulvia/cms.")
            ? `contracts/cms/${resourceName(id)}/definition.json`
            : `contracts/${resourceName(id)}/definition.json`;
        contractPaths.push(path);
        await writeArtifact(root, path, bytes);
    }
    for (const asset of artifacts.contractAssets) {
        const contractRoot = asset.contractId.startsWith("ulvia/cms.")
            ? `contracts/cms/${resourceName(asset.contractId)}`
            : `contracts/${resourceName(asset.contractId)}`;
        await writeBytes(root, `${contractRoot}/${asset.id}`, asset.bytes);
    }
    const provider = "providers/primary-provider/definition.json";
    await writeArtifact(root, provider, artifacts.provider);
    const collections = [];
    for (const collection of artifacts.collections) {
        const release = `collections/${resourceName(collection.id)}/release.json`;
        const assets = collection.assets.map(({ id }) => ({
            id,
            path: `collections/${resourceName(collection.id)}/assets/${id}`,
        }));
        await writeArtifact(root, release, collection.canonicalJson);
        for (const [index, asset] of collection.assets.entries()) {
            await writeBytes(root, assets[index]!.path, asset.bytes);
        }
        collections.push({ release, assets });
    }
    await writeFile(
        join(root, "index.json"),
        `${JSON.stringify({ contracts: contractPaths, provider, collections }, null, 4)}\n`,
    );
    await bootstrapOfficialRepository(join(root, "repository"), root);
}

async function writeArtifact(root: string, path: string, bytes: string): Promise<void> {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${bytes}\n`);
}

async function writeBytes(root: string, path: string, bytes: Uint8Array): Promise<void> {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
}

async function directories(root: string): Promise<string[]> {
    return (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

if (import.meta.main) {
    await writeOfficialBootstrapArtifacts();
}
