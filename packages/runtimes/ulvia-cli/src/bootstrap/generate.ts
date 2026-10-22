import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import { compileConformanceSource, prepareConformanceSource } from "../release/authored/conformance";
import { resolveConformanceDependencies } from "../release/authored/conformanceDependencies";
import { prepareContractSource } from "../release/authored/contract";
import { prepareCollectionRelease } from "../release/source";

export type OfficialBootstrapArtifacts = Readonly<{
    contracts: Readonly<Record<string, string>>;
    provider: string;
    providerDigest: string;
    collection: string;
    collectionAssets: readonly Readonly<{ id: string; bytes: Uint8Array }>[];
}>;

export async function buildOfficialBootstrapArtifacts(): Promise<OfficialBootstrapArtifacts> {
    const root = resolve(import.meta.dir, "../../../../official-repository");
    const catalogue = new InMemoryReleaseCatalogue();
    const contracts: Record<string, string> = {};
    const admissions = new Map<string, AdmittedContractRelease>();
    const contractIds = await directories(join(root, "contracts"));
    for (const id of contractIds) {
        const directory = join(root, "contracts", id);
        const { admission } = await prepareContractSource(directory);
        admissions.set(`${admission.release.contractId}@${admission.release.version}`, admission);
    }
    const publicationOrder = await publishContractSet(catalogue, [...admissions.values()]);
    for (const admission of publicationOrder) {
        contracts[admission.release.contractId] = admission.canonicalJson;
    }
    for (const id of contractIds) {
        const directory = join(root, "contracts", id);
        const conformance = await compileConformanceSource(directory);
        if (conformance) {
            const definition = JSON.parse(conformance) as { contractId?: unknown; contractVersion?: unknown };
            const release = admissions.get(`${definition.contractId}@${definition.contractVersion}`);
            if (!release) {
                throw new Error(`Conformance source ${id} does not identify an official contract release`);
            }
            const dependencies = await resolveConformanceDependencies(conformance, async (contractId, version) => {
                return admissions.get(`${contractId}@${version}`) ?? null;
            });
            await prepareConformanceSource(directory, release, dependencies, conformance);
        }
    }
    const provider = await admitProviderManifestJson(
        await readFile(join(root, "providers", "ulvia.official", "definition.json"), "utf8"),
        catalogue,
    );
    const collection = await prepareCollectionRelease(join(root, "collections", "ulvia-official"), catalogue);
    return {
        contracts,
        provider: provider.canonicalJson,
        providerDigest: provider.digest,
        collection: collection.canonicalJson,
        collectionAssets: await Promise.all(
            collection.assets.map(async ({ id, bytes }) => ({
                id,
                bytes: new Uint8Array(await bytes.arrayBuffer()),
            })),
        ),
    };
}

export async function writeOfficialBootstrapArtifacts(
    root = resolve(import.meta.dir, "../../dist/bootstrap"),
): Promise<void> {
    const artifacts = await buildOfficialBootstrapArtifacts();
    await rm(root, { recursive: true, force: true });
    const contractPaths: string[] = [];
    for (const [id, bytes] of Object.entries(artifacts.contracts)) {
        const path = id.startsWith("ulvia.cms.")
            ? `contracts/cms/${id}/definition.json`
            : `contracts/${id}/definition.json`;
        contractPaths.push(path);
        await writeArtifact(root, path, bytes);
    }
    const provider = "providers/ulvia.official/definition.json";
    const collection = "collections/ulvia-official/release.json";
    const collectionAssets = artifacts.collectionAssets.map(({ id }) => ({
        id,
        path: `collections/ulvia-official/assets/${id}`,
    }));
    await writeArtifact(root, provider, artifacts.provider);
    await writeArtifact(root, collection, artifacts.collection);
    for (const [index, asset] of artifacts.collectionAssets.entries()) {
        await writeBytes(root, collectionAssets[index]!.path, asset.bytes);
    }
    await writeFile(
        join(root, "index.json"),
        `${JSON.stringify({ contracts: contractPaths, provider, collection, collectionAssets }, null, 4)}\n`,
    );
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
