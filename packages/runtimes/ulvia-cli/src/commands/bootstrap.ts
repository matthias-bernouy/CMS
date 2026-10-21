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
    collection: string;
    collectionAssets: readonly Readonly<{ id: string; path: string }>[];
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
            await contracts.publish(await readFile(join(root, path), "utf8"));
        }
        await new LocalProviderReleases(files, contracts).release(await readFile(join(root, index.provider), "utf8"));
        const collection = await admitCollectionReleaseJson(
            await readFile(join(root, index.collection), "utf8"),
            await Promise.all(
                index.collectionAssets.map(async ({ id, path }) => ({ id, bytes: await readFile(join(root, path)) })),
            ),
            { contracts: await contracts.catalogue() },
        );
        await new LocalCollectionRepository(repositoryRoot).store(collection);
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
        keys.length !== 4 ||
        keys[0] !== "collection" ||
        keys[1] !== "collectionAssets" ||
        keys[2] !== "contracts" ||
        keys[3] !== "provider" ||
        !Array.isArray(contracts) ||
        contracts.length === 0 ||
        contracts.length > 128 ||
        contracts.some(
            (path) => typeof path !== "string" || !/^contracts\/(?:cms\/)?[a-z0-9.-]+\/definition\.json$/u.test(path),
        ) ||
        new Set(contracts).size !== contracts.length ||
        index.provider !== "providers/ulvia.official/definition.json" ||
        index.collection !== "collections/ulvia-official/release.json" ||
        !isCollectionAssetIndex(index.collectionAssets)
    ) {
        throw new Error("Official bootstrap index is invalid");
    }
    return {
        contracts,
        provider: index.provider,
        collection: index.collection,
        collectionAssets: index.collectionAssets,
    } as BootstrapIndex;
}

function isCollectionAssetIndex(value: unknown): value is BootstrapIndex["collectionAssets"] {
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
            path !== `collections/ulvia-official/assets/${id}` ||
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
