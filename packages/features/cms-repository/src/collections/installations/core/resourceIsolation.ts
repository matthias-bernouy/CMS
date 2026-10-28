import { collectionExampleDocument } from "../../core/validation/examples/document";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { collectionThemeTokenId } from "../../core/namespace";
import { validateCollectionStateBindings } from "../../core/validation/markup/state";
import { DEFAULT_COLLECTION_LIMITS } from "../../core/limits";
import { validateMarkup } from "../../core/validation/markup/validateMarkup";
import { satisfiesVersionRange } from "../../../exports/contracts/compatibility";
import { validateExpandedPageDocument, validatePageDocument } from "@bernouy/cms-content/page-document";
import { collectionDocumentDefinitions } from "../../core/parsing/documents/definitions";
import { validateInstalledCollectionSvgReferences } from "../../core/validation/markup/assets";

export function assertCollectionResourceIsolation(releases: readonly CollectionRelease[]): void {
    const blocTags = new Set<string>();
    const themeTokens = new Set<string>();
    for (const release of releases) {
        for (const bloc of release.blocs) {
            assertUnique(blocTags, bloc.id, "Bloc tag");
        }
        for (const token of release.theme?.categories.flatMap((category) =>
            category.entries.filter((entry) => entry.type !== "font-face"),
        ) ?? []) {
            assertUnique(themeTokens, collectionThemeTokenId(release.collectionId, token.id), "theme token");
        }
    }
    assertCollectionDependencies(releases);
    validateInstalledExampleDocuments(releases);
    validateMarkup(
        releases.flatMap((release) => release.blocs),
        DEFAULT_COLLECTION_LIMITS,
    );
}

function validateInstalledExampleDocuments(releases: readonly CollectionRelease[]): void {
    const blocs = releases.flatMap((release) => release.blocs);
    const definitions = collectionDocumentDefinitions(blocs);
    for (const release of releases) {
        for (const example of release.examples ?? []) {
            const path = `Collection example ${release.collectionId}.${example.id}`;
            try {
                const html = collectionExampleDocument(release, example.id, releases).html;
                const document = validatePageDocument(html, blocs);
                validateExpandedPageDocument(document.html, definitions);
            } catch (error) {
                reject(`${path} is invalid: ${error instanceof Error ? error.message : "invalid example document"}`);
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
        try {
            validateInstalledCollectionSvgReferences(release, byId);
        } catch (error) {
            reject(
                error instanceof Error ? error.message : `Collection ${release.collectionId} has an invalid SVG asset`,
            );
        }
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
        for (const field of ["blocs", "themeTokens", "texts", "assets", "states"] as const) {
            const exported = new Set(target.exports?.[field] ?? []);
            const available =
                field === "themeTokens"
                    ? new Set(
                          target.theme?.categories.flatMap((category) =>
                              category.entries.filter((entry) => entry.type !== "font-face").map((entry) => entry.id),
                          ) ?? [],
                      )
                    : new Set((target[field] ?? []).map((entry) => entry.id));
            for (const imported of dependency.imports[field] ?? []) {
                if (!exported.has(imported.id) || !available.has(imported.id)) {
                    reject(
                        `Collection ${release.collectionId} imports unavailable ${field} ${dependency.collectionId}:${imported.id}`,
                    );
                }
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
                    category.entries
                        .filter((entry) => entry.type !== "font-face")
                        .map((token) => [token.id, token] as const),
                ),
            );
            return dependency.imports.themeTokens.map(
                ({ id }) => [collectionThemeTokenId(dependency.collectionId, id), tokens.get(id)!] as const,
            );
        }),
    );
    for (const token of release.theme?.categories.flatMap((category) =>
        category.entries.filter((entry) => entry.type !== "font-face"),
    ) ?? []) {
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
