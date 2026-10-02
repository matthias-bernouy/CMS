import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { collectionThemeTokenId } from "../../core/namespace";
import { DEFAULT_COLLECTION_LIMITS } from "../../core/limits";
import { validateMarkup } from "../../core/validation/markup/validateMarkup";
import { satisfiesVersionRange } from "../../../exports/contracts/compatibility";
import type { CollectionInstallation, CollectionStorage } from "../interfaces/store";

export async function assertInstallableCollectionResources(
    storage: CollectionStorage,
    installations: readonly Pick<CollectionInstallation, "collectionId" | "digest">[],
    candidate: CollectionRelease,
): Promise<void> {
    const releases = await Promise.all(
        installations.map(async (installation) => {
            const artifact = await storage.getRelease(installation.digest);
            if (!artifact || artifact.release.collectionId !== installation.collectionId) {
                throw new Error("Installed collection artifact is missing or inconsistent");
            }
            return artifact.release;
        }),
    );
    assertCollectionResourceIsolation([...releases, candidate]);
}

export function assertCollectionResourceIsolation(releases: readonly CollectionRelease[]): void {
    const blocTags = new Set<string>();
    const themeTokens = new Set<string>();
    for (const release of releases) {
        for (const bloc of release.blocs) {
            assertUnique(blocTags, bloc.id, "Bloc tag");
        }
        for (const token of release.theme?.categories.flatMap((category) => category.tokens) ?? []) {
            assertUnique(themeTokens, collectionThemeTokenId(release.collectionId, token.id), "theme token");
        }
    }
    assertCollectionDependencies(releases);
    validateMarkup(
        releases.flatMap((release) => release.blocs),
        DEFAULT_COLLECTION_LIMITS,
    );
}

function assertCollectionDependencies(releases: readonly CollectionRelease[]): void {
    const byId = new Map(releases.map((release) => [release.collectionId, release]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    for (const release of releases) {
        validateDependencies(release, byId);
        visit(release.collectionId, byId, visiting, visited, []);
    }
}

function validateDependencies(release: CollectionRelease, byId: ReadonlyMap<string, CollectionRelease>): void {
    for (const dependency of release.dependencies ?? []) {
        const target = byId.get(dependency.collectionId);
        if (!target) {
            reject(`Collection ${release.collectionId} requires ${dependency.collectionId} to be installed`);
        }
        if (
            target.publisherId !== dependency.publisherId ||
            !satisfiesVersionRange(target.version, dependency.versionRange)
        ) {
            reject(
                `Collection ${release.collectionId} requires ${dependency.publisherId}/${dependency.collectionId} ${dependency.versionRange}`,
            );
        }
        const exportedBlocs = new Set(target.exports?.blocs ?? []);
        const targetBlocs = new Set(target.blocs.map((bloc) => bloc.id));
        for (const bloc of dependency.imports.blocs) {
            if (!exportedBlocs.has(bloc) || !targetBlocs.has(bloc)) {
                reject(`Collection ${release.collectionId} imports unavailable bloc ${bloc}`);
            }
        }
        const exportedTokens = new Set(target.exports?.themeTokens ?? []);
        const targetTokens = new Set(
            target.theme?.categories.flatMap((category) => category.tokens.map((token) => token.id)) ?? [],
        );
        for (const token of dependency.imports.themeTokens) {
            if (!exportedTokens.has(token) || !targetTokens.has(token)) {
                reject(
                    `Collection ${release.collectionId} imports unavailable theme token ${target.collectionId}-${token}`,
                );
            }
        }
    }
}

function visit(
    collectionId: string,
    releases: ReadonlyMap<string, CollectionRelease>,
    visiting: Set<string>,
    visited: Set<string>,
    path: readonly string[],
): void {
    if (visiting.has(collectionId)) {
        reject(`Collection dependency cycle: ${[...path, collectionId].join(" -> ")}`);
    }
    if (visited.has(collectionId)) {
        return;
    }
    visiting.add(collectionId);
    const release = releases.get(collectionId)!;
    for (const dependency of release.dependencies ?? []) {
        visit(dependency.collectionId, releases, visiting, visited, [...path, collectionId]);
    }
    visiting.delete(collectionId);
    visited.add(collectionId);
}

function assertUnique(seen: Set<string>, value: string, kind: string): void {
    if (seen.has(value)) {
        throw Object.assign(new Error(`${kind} already belongs to an installed collection: ${value}`), {
            status: 409,
        });
    }
    seen.add(value);
}

function reject(message: string): never {
    throw Object.assign(new Error(message), { status: 409 });
}
