import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { collectionThemeTokenId } from "../../core/namespace";
import { DEFAULT_COLLECTION_LIMITS } from "../../core/limits";
import { validateMarkup } from "../../core/validation/markup/validateMarkup";
import { satisfiesVersionRange } from "../../../exports/contracts/compatibility";
import type { CollectionInstallation, CollectionStorage } from "../interfaces/store";
import { assertCompatibleSurface, pageReferences } from "../../core/parsing/pages/references";

export async function assertInstallableCollectionResources(
    storage: CollectionStorage,
    installations: readonly Pick<CollectionInstallation, "collectionId" | "digest">[],
    candidate: CollectionRelease,
): Promise<void> {
    const releases = await Promise.all(
        installations.map(async (installation) => {
            const artifact = await storage.getReleaseMetadata(installation.digest);
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
    const pagePaths = new Set<string>();
    for (const release of releases) {
        for (const bloc of release.blocs) {
            assertUnique(blocTags, bloc.id, "Bloc tag");
        }
        for (const token of release.theme?.categories.flatMap((category) => category.tokens) ?? []) {
            assertUnique(themeTokens, collectionThemeTokenId(release.collectionId, token.id), "theme token");
        }
        for (const page of release.pages ?? []) {
            assertUnique(pagePaths, `${page.surface}:${page.defaultPath}`, "Page default path");
        }
    }
    assertCollectionDependencies(releases);
    validatePageBlocSurfaces(releases);
    validateInstalledPageReferences(releases);
    validateMarkup(
        releases.flatMap((release) => release.blocs),
        DEFAULT_COLLECTION_LIMITS,
    );
}

function validateInstalledPageReferences(releases: readonly CollectionRelease[]): void {
    const pages = new Map(
        releases.flatMap((release) =>
            (release.pages ?? []).map(
                (page) => [`${release.publisherId}\0${release.collectionId}\0${page.id}`, { release, page }] as const,
            ),
        ),
    );
    for (const release of releases) {
        for (const page of release.pages ?? []) {
            for (const reference of pageReferences(page.document.html)) {
                if (reference.kind === "site") {
                    continue;
                }
                const target = pages.get(`${reference.publisherId}\0${reference.collectionId}\0${reference.pageId}`);
                if (!target) {
                    reject(
                        `Collection Page ${release.collectionId}.${page.id} references unavailable Page ${reference.collectionId}.${reference.pageId}`,
                    );
                }
                assertCompatibleSurface(
                    page.surface,
                    target.page.surface,
                    release.collectionId,
                    page.id,
                    reference.pageId,
                );
            }
        }
    }
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
        const targetBlocs = new Map(target.blocs.map((bloc) => [bloc.id, bloc.generation ?? 1]));
        for (const bloc of dependency.imports.blocs) {
            if (!exportedBlocs.has(bloc.id) || targetBlocs.get(bloc.id) !== bloc.generation) {
                reject(
                    `Collection ${release.collectionId} imports unavailable bloc ${bloc.id} generation ${bloc.generation}`,
                );
            }
        }
        const exportedTokens = new Set(target.exports?.themeTokens ?? []);
        const targetTokens = new Map(
            target.theme?.categories.flatMap((category) =>
                category.tokens.map((token) => [token.id, token.generation ?? 1] as const),
            ) ?? [],
        );
        for (const token of dependency.imports.themeTokens) {
            if (!exportedTokens.has(token.id) || targetTokens.get(token.id) !== token.generation) {
                reject(
                    `Collection ${release.collectionId} imports unavailable theme token ${target.collectionId}-${token.id} generation ${token.generation}`,
                );
            }
        }
        const exportedTexts = new Set(target.exports?.texts ?? []);
        const targetTexts = new Map((target.texts ?? []).map((text) => [text.id, text.generation ?? 1]));
        for (const text of dependency.imports.texts ?? []) {
            if (!exportedTexts.has(text.id) || targetTexts.get(text.id) !== text.generation) {
                reject(
                    `Collection ${release.collectionId} imports unavailable text ${target.collectionId}.${text.id} generation ${text.generation}`,
                );
            }
        }
        const exportedAssets = new Set(target.exports?.assets ?? []);
        const targetAssets = new Map(target.assets.map((asset) => [asset.id, asset.generation ?? 1]));
        for (const asset of dependency.imports.assets ?? []) {
            if (!exportedAssets.has(asset.id) || targetAssets.get(asset.id) !== asset.generation) {
                reject(
                    `Collection ${release.collectionId} imports unavailable asset ${target.collectionId}.${asset.id} generation ${asset.generation}`,
                );
            }
        }
        const exportedPages = new Set(target.exports?.pages ?? []);
        const targetPages = new Map((target.pages ?? []).map((page) => [page.id, page.generation ?? 1]));
        for (const page of dependency.imports.pages ?? []) {
            if (!exportedPages.has(page.id) || targetPages.get(page.id) !== page.generation) {
                reject(
                    `Collection ${release.collectionId} imports unavailable page ${target.collectionId}.${page.id} generation ${page.generation}`,
                );
            }
        }
    }
    validateImportedThemeTypes(release, byId);
}

function validatePageBlocSurfaces(releases: readonly CollectionRelease[]): void {
    const blocs = new Map(releases.flatMap((release) => release.blocs.map((bloc) => [bloc.id, bloc] as const)));
    for (const release of releases) {
        for (const page of release.pages ?? []) {
            const pending = [...page.uses];
            const seen = new Set<string>();
            while (pending.length > 0) {
                const id = pending.pop()!;
                if (seen.has(id)) {
                    continue;
                }
                seen.add(id);
                const bloc = blocs.get(id);
                if (!bloc) {
                    reject(`Collection page ${release.collectionId}.${page.id} references unavailable bloc ${id}`);
                }
                if (!bloc.surfaces.includes(page.surface)) {
                    reject(
                        `Collection page ${release.collectionId}.${page.id} cannot use ${id} on the ${page.surface} surface`,
                    );
                }
                pending.push(...bloc.uses);
            }
        }
    }
}

function validateImportedThemeTypes(release: CollectionRelease, byId: ReadonlyMap<string, CollectionRelease>): void {
    const imported = new Map(
        (release.dependencies ?? []).flatMap((dependency) => {
            const target = byId.get(dependency.collectionId)!;
            const tokens = new Map(
                (target.theme?.categories ?? []).flatMap((category) =>
                    category.tokens.map((token) => [token.id, token] as const),
                ),
            );
            return dependency.imports.themeTokens.map(
                ({ id }) => [collectionThemeTokenId(dependency.collectionId, id), tokens.get(id)!] as const,
            );
        }),
    );
    for (const token of release.theme?.categories.flatMap((category) => category.tokens) ?? []) {
        for (const value of Object.values(token.defaults)) {
            const match = /^var\(\s*--([a-z][a-z0-9-]*)\s*\)$/iu.exec(value);
            const target = match ? imported.get(match[1]!) : undefined;
            if (target && token.type !== "value" && target.type !== "value" && token.type !== target.type) {
                reject(
                    `Theme token ${release.collectionId}-${token.id} cannot use ${target.type} token --${match![1]}`,
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
