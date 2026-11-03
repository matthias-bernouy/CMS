import { parseContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { dirname } from "node:path";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { admitCollectionReleaseJson } from "@bernouy/cms-repository/collections";
import {
    LocalArtifactFiles,
    LocalCollectionRepository,
    LocalContractReleases,
    LocalProviderReleases,
    withRepositoryWriteLock,
} from "@bernouy/cms-repository/repository/filesystem";

type BootstrapIndex = Readonly<{
    contracts: readonly string[];
    provider: string;
    collections: readonly Readonly<{
        release: string;
        assets: readonly Readonly<{ id: string; path: string }>[];
    }>[];
}>;

/** Admits pre-built official releases without reading authored source folders at runtime. */
export async function bootstrapOfficialRepository(
    repositoryRoot: string,
    root = resolve(import.meta.dir, "../../dist/bootstrap"),
): Promise<void> {
    const index = parseBootstrapIndex(JSON.parse(await readFile(join(root, "index.json"), "utf8")));
    await withRepositoryWriteLock(repositoryRoot, async () => {
        const files = new LocalArtifactFiles(repositoryRoot);
        const contracts = new LocalContractReleases(files);
        for (const path of index.contracts) {
            const source = await readFile(join(root, path), "utf8");
            const metadata = parseContractReleaseJson(source);
            const assets = await Promise.all(
                (metadata.documentation ?? []).map(async (document) => ({
                    id: `docs/${document.path}`,
                    bytes: await readFile(join(root, dirname(path), "docs", document.path)),
                })),
            );
            await contracts.publish(source, assets);
        }
        await new LocalProviderReleases(files, contracts).release(await readFile(join(root, index.provider), "utf8"));
        const catalogue = await contracts.catalogue();
        const collections = new LocalCollectionRepository(repositoryRoot);
        for (const entry of index.collections) {
            const collection = await admitCollectionReleaseJson(
                await readFile(join(root, entry.release), "utf8"),
                await Promise.all(
                    entry.assets.map(async ({ id, path }) => ({ id, bytes: await readFile(join(root, path)) })),
                ),
                { contracts: catalogue },
            );
            if (entry.release !== `collections/${collection.release.collectionId}/release.json`) {
                throw new Error("Official collection index differs from its admitted identity");
            }
            await collections.store(collection);
        }
    });
}

function parseBootstrapIndex(value: unknown): BootstrapIndex {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Official bootstrap index must be an object");
    }
    const index = value as Record<string, unknown>;
    const contracts = index.contracts;
    const keys = Object.keys(index).toSorted();
    if (
        keys.join(",") !== "collections,contracts,provider" ||
        !Array.isArray(contracts) ||
        contracts.length === 0 ||
        contracts.length > 128 ||
        contracts.some(
            (path) => typeof path !== "string" || !/^contracts\/(?:cms\/)?[a-z0-9.-]+\/definition\.json$/u.test(path),
        ) ||
        new Set(contracts).size !== contracts.length ||
        index.provider !== "providers/ulvia.official/definition.json" ||
        !isCollectionIndex(index.collections)
    ) {
        throw new Error("Official bootstrap index is invalid");
    }
    return {
        contracts,
        provider: index.provider,
        collections: index.collections,
    } as BootstrapIndex;
}

function isCollectionIndex(value: unknown): value is BootstrapIndex["collections"] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
        return false;
    }
    const paths = new Set<string>();
    for (const entry of value) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return false;
        }
        const record = entry as Record<string, unknown>;
        if (
            Object.keys(record).toSorted().join(",") !== "assets,release" ||
            typeof record.release !== "string" ||
            !/^collections\/[a-z0-9][a-z0-9-]*\/release\.json$/u.test(record.release) ||
            paths.has(record.release) ||
            !isCollectionAssetIndex(record.assets, dirname(record.release))
        ) {
            return false;
        }
        paths.add(record.release);
    }
    return true;
}

function isCollectionAssetIndex(value: unknown, collectionRoot: string): boolean {
    if (!Array.isArray(value) || value.length > 512) {
        return false;
    }
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const entry of value) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return false;
        }
        const record = entry as Record<string, unknown>;
        const id = record.id;
        const path = record.path;
        if (
            Object.keys(record).toSorted().join(",") !== "id,path" ||
            typeof id !== "string" ||
            !/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/u.test(id) ||
            typeof path !== "string" ||
            path !== `${collectionRoot}/assets/${id}` ||
            ids.has(id) ||
            paths.has(path)
        ) {
            return false;
        }
        ids.add(id);
        paths.add(path);
    }
    return true;
}
