import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { compareSemVer, isCanonicalSemVer, releaseChannel } from "cms-repository/exports/contracts/compatibility";
import { isResourceId, resourcePublisher, resourceName } from "cms-repository/exports/contracts/protocol";

export type CollectionReference = Readonly<{ publisherId: string; collectionId: string; version: string }>;
export type CollectionReferenceScope = Readonly<{
    collectionId: string;
    publisherId?: string;
    channel: "stable" | "beta" | "all";
    version?: string;
}>;

export function validCollectionScope(input: CollectionReferenceScope): boolean {
    return (
        isResourceId(input.collectionId) &&
        (input.publisherId === undefined || input.publisherId === resourcePublisher(input.collectionId))
    );
}

/** Filenames only. Exact lookups use one existence check and never enumerate history. */
export async function collectionReferences(
    root: string,
    input: CollectionReferenceScope,
    yanked: ReadonlySet<string>,
): Promise<readonly CollectionReference[]> {
    if (!validCollectionScope(input)) {
        return [];
    }
    const publisherId = resourcePublisher(input.collectionId);
    const directory = join(root, "releases", publisherId, resourceName(input.collectionId));
    let versions: string[];
    if (input.version !== undefined) {
        if (!isCanonicalSemVer(input.version) || !(await Bun.file(join(directory, `${input.version}.json`)).exists())) {
            return [];
        }
        versions = [input.version];
    } else {
        const files = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return [];
            }
            throw error;
        });
        versions = files
            .filter((file) => file.isFile() && file.name.endsWith(".json"))
            .map((file) => file.name.slice(0, -5));
        if (versions.length > 10_000) {
            throw new Error("Collection history exceeds its reference bound");
        }
        versions.sort((a, b) => compareSemVer(a, b) || (a < b ? -1 : a > b ? 1 : 0));
    }
    return versions
        .filter(
            (version) =>
                (input.channel === "all" || releaseChannel(version) === input.channel) &&
                !yanked.has(`collection\0${publisherId}\0${input.collectionId}\0${version}`),
        )
        .map((version) => ({ publisherId, collectionId: input.collectionId, version }));
}
