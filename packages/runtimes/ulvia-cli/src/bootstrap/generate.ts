import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { createImplementationArtifact } from "@bernouy/ulvia-sdk/build";
import type { ImplementationArtifact } from "@bernouy/ulvia-sdk/build";
import { prepareOfficialResources } from "./resources";
import { resourceName } from "@bernouy/ulvia-contracts/protocol";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { bootstrapOfficialRepository } from "../commands/bootstrap";

export type OfficialBootstrapArtifacts = Readonly<{
    runtimeArtifact: ImplementationArtifact;
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

export async function buildOfficialBootstrapArtifacts(
    options: { includeCollections?: boolean } = {},
): Promise<OfficialBootstrapArtifacts> {
    const resources = await prepareOfficialResources(options);
    const contracts: Record<string, string> = {};
    const contractAssets: { contractId: string; id: string; bytes: Uint8Array }[] = [];
    const collections = [];
    const provider = resources.find((resource) => resource.kind === "provider-manifest")!.admission;
    for (const resource of resources) {
        if (resource.kind === "contract") {
            const { admission } = resource;
            contracts[admission.release.contractId] = admission.canonicalJson;
            for (const asset of [...(admission.documentationAssets ?? []), ...(admission.fixtureAssets ?? [])]) {
                contractAssets.push({
                    contractId: admission.release.contractId,
                    id: asset.id,
                    bytes: new Uint8Array(await asset.bytes.arrayBuffer()),
                });
            }
        } else if (resource.kind === "collection") {
            collections.push({
                id: resource.admission.release.collectionId,
                canonicalJson: resource.admission.canonicalJson,
                assets: await Promise.all(
                    resource.admission.assets.map(async ({ id, bytes }) => ({
                        id,
                        bytes: new Uint8Array(await bytes.arrayBuffer()),
                    })),
                ),
            });
        }
    }

    return {
        runtimeArtifact: createImplementationArtifact(await compileOfficialFeatures()),
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
    await writeArtifact(root, "feature-runtime.json", JSON.stringify(artifacts.runtimeArtifact, null, 4));
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

if (import.meta.main) {
    const args = Bun.argv.slice(2);
    if (args.some((arg) => arg !== "--core-only") || args.length > 1) {
        throw new Error("Usage: generate:bootstrap [--core-only]");
    }
    const coreOnly = args.includes("--core-only");
    await writeOfficialBootstrapArtifacts(
        coreOnly ? resolve(import.meta.dir, "../../dist/bootstrap-core") : undefined,
        coreOnly ? await buildOfficialBootstrapArtifacts({ includeCollections: false }) : undefined,
    );
}
