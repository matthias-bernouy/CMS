import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { collectionThemeTokenId } from "../../core/namespace";
import { validateCollectionStateBindings } from "../../core/validation/markup/state";
import { DEFAULT_COLLECTION_LIMITS } from "../../core/limits";
import { validateMarkup } from "../../core/validation/markup/validateMarkup";
import { satisfiesVersionRange } from "../../../exports/contracts/compatibility";
import type { CollectionInstallation, CollectionStorage } from "../interfaces/store";
import { pageLinks, pageLinkSources } from "../../core/parsing/pages/references";
import { validateExpandedPageDocument, validatePageDocument } from "@bernouy/cms-content/page-document";
import { collectionPageDefinitions } from "../../core/parsing/pages/definitions";

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
            assertUnique(pagePaths, page.defaultPath, "Page default path");
        }
    }
    assertCollectionDependencies(releases);
    validateInstalledPageDocuments(releases);
    validateInstalledPageLinks(releases);
    validateMarkup(
        releases.flatMap((release) => release.blocs),
        DEFAULT_COLLECTION_LIMITS,
    );
}

function validateInstalledPageDocuments(releases: readonly CollectionRelease[]): void {
    const blocs = releases.flatMap((release) => release.blocs);
    const definitions = collectionPageDefinitions(blocs);
    for (const release of releases) {
        for (const page of release.pages ?? []) {
            const path = `Collection Page ${release.collectionId}.${page.id}`;
            try {
                const document = validatePageDocument(page.document.html, blocs);
                validateExpandedPageDocument(document.html, definitions);
            } catch (error) {
                reject(`${path} is invalid: ${error instanceof Error ? error.message : "invalid Page document"}`);
            }
        }
    }
}

function validateInstalledPageLinks(releases: readonly CollectionRelease[]): void {
    const pages = new Map(
        releases.flatMap((release) =>
            (release.pages ?? []).map((page) => [page.defaultPath, { release, page }] as const),
        ),
    );
    for (const release of releases) {
        for (const page of release.pages ?? []) {
            const sources = [page.document.html, ...pageLinkSources(release, page.uses)];
            for (const path of sources.flatMap(pageLinks)) {
                const target = pages.get(path);
                if (!target || target.release.collectionId === release.collectionId) {
                    continue;
                }
                const dependency = release.dependencies?.find(
                    ({ publisherId, collectionId }) =>
                        publisherId === target.release.publisherId && collectionId === target.release.collectionId,
                );
                if (!dependency?.imports.pages?.some(({ id }) => id === target.page.id)) {
                    reject(
                        `Collection Page ${release.collectionId}.${page.id} links to Page ${target.release.collectionId}.${target.page.id} without importing it`,
                    );
                }
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
        validateCollectionStateBindings(release, byId);
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
            const targetPage = target.pages?.find(({ id }) => id === page.id);
            if (
                !exportedPages.has(page.id) ||
                targetPages.get(page.id) !== page.generation ||
                targetPage?.defaultPath !== page.defaultPath
            ) {
                reject(
                    `Collection ${release.collectionId} imports unavailable page ${target.collectionId}.${page.id} generation ${page.generation} at ${page.defaultPath}`,
                );
            }
        }
        const exportedStates = new Set(target.exports?.states ?? []);
        const targetStates = new Map((target.states ?? []).map((state) => [state.id, state.generation ?? 1]));
        for (const state of dependency.imports.states ?? []) {
            if (!exportedStates.has(state.id) || targetStates.get(state.id) !== state.generation) {
                reject(
                    `Collection ${release.collectionId} imports unavailable state ${target.collectionId}-${state.id} generation ${state.generation}`,
                );
            }
        }
    }
    validateImportedThemeTypes(release, byId);
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
