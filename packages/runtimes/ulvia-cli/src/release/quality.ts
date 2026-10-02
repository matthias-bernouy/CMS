import { collectionThemeTokenId, type CollectionRelease } from "@bernouy/cms-repository/collections";

const REFERENCE = /var\(\s*--([a-z_][a-z0-9_-]*)/giu;
const DECLARATION = /--([a-z_][a-z0-9_-]*)\s*:/giu;

/** Source-level checks that require the complete assembled collection. */
export function assertCollectionSourceQuality(release: CollectionRelease): void {
    const tokens = new Set([
        ...(release.theme?.categories.flatMap((category) =>
            category.tokens.map((token) => collectionThemeTokenId(release.collectionId, token.id)),
        ) ?? []),
        ...(release.dependencies?.flatMap((dependency) =>
            dependency.imports.themeTokens.map((token) => collectionThemeTokenId(dependency.collectionId, token)),
        ) ?? []),
    ]);
    const namespaces = [
        release.collectionId,
        ...(release.dependencies?.map((dependency) => dependency.collectionId) ?? []),
    ].sort((left, right) => right.length - left.length);
    for (const bloc of release.blocs) {
        if (bloc.kind !== "component" || !bloc.style) {
            continue;
        }
        validateStyle(bloc.id, bloc.style, tokens, namespaces);
    }
}

function validateStyle(
    blocId: string,
    source: string,
    tokens: ReadonlySet<string>,
    namespaces: readonly string[],
): void {
    const css = source.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
    const declarations = new Set([...css.matchAll(DECLARATION)].map((match) => match[1]!));
    for (const match of css.matchAll(REFERENCE)) {
        const variable = match[1]!;
        if (tokens.has(variable) || declarations.has(variable) || variable.startsWith("_")) {
            continue;
        }
        if (namespaces.some((namespace) => variable.startsWith(`${namespace}-`))) {
            throw new Error(`Bloc ${blocId} CSS references unknown or unimported theme token --${variable}`);
        }
    }
}
