import { isVersionRangeSubset, parseVersionRange } from "cms-repository/exports/contracts/compatibility";
import type {
    CollectionCapabilityRequirement,
    CollectionDependency,
    CollectionResourceImport,
    CollectionResourceImportSelection,
    CollectionResourceSelection,
} from "../../interfaces/CollectionRelease";
import { invalid } from "../errors";
import type { CollectionLimits } from "../limits";
import { array, identifier, integer, keys, ordinal, record, string, unique } from "../values";
import { collectionThemeTokenId, parseCollectionBlocTag, parseCollectionNamespace } from "../namespace";
import { textIdentifier } from "../texts/validation";

const CAPABILITY_SOURCE =
    /^\/\.cms\/call\/(?<contract>[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)\/(?<capability>[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)$/u;

export function capabilityCallKey(url: string): string | null {
    const match = CAPABILITY_SOURCE.exec(url);
    return match?.groups ? `${match.groups.contract}/${match.groups.capability}` : null;
}

export function parseRequirements(
    value: unknown,
    path: string,
    limits: Readonly<CollectionLimits>,
): readonly CollectionCapabilityRequirement[] {
    const requirements = array(value === undefined ? [] : value, limits.maxRequirementsPerResource, path).map(
        (entry, index) => {
            const at = `${path}[${index}]`;
            const source = record(entry, at);
            keys(source, ["contractId", "capabilityId", "versionRange"], at);
            const versionRange = parseVersionRange(
                string(source.versionRange, 256, `${at}.versionRange`),
                `${at}.versionRange`,
            );
            if (isVersionRangeSubset(versionRange, "<0.0.0")) {
                invalid("must accept at least one contract version", `${at}.versionRange`);
            }
            return {
                contractId: contractIdentifier(source.contractId, 128, `${at}.contractId`),
                capabilityId: contractIdentifier(source.capabilityId, 128, `${at}.capabilityId`),
                versionRange,
            };
        },
    );
    unique(
        requirements.map((item) => `${item.contractId}/${item.capabilityId}`),
        path,
    );
    return requirements.sort((a, b) => ordinal(a.contractId, b.contractId) || ordinal(a.capabilityId, b.capabilityId));
}

export function parseCollectionDependencies(
    value: unknown,
    ownerCollectionId: string,
    limits: Readonly<CollectionLimits>,
): readonly CollectionDependency[] {
    const dependencies = array(value, limits.maxDependencies, "$.dependencies").map((entry, index) => {
        const path = `$.dependencies[${index}]`;
        const source = record(entry, path);
        keys(source, ["collectionId", "publisherId", "versionRange", "imports"], path);
        const collectionId = parseCollectionNamespace(source.collectionId, `${path}.collectionId`);
        if (collectionId === ownerCollectionId) {
            invalid("must reference another collection", `${path}.collectionId`);
        }
        const versionRange = parseVersionRange(
            string(source.versionRange, 256, `${path}.versionRange`),
            `${path}.versionRange`,
        );
        if (isVersionRangeSubset(versionRange, "<0.0.0")) {
            invalid("must accept at least one collection version", `${path}.versionRange`);
        }
        const imports = parseResourceImports(source.imports, collectionId, `${path}.imports`, limits);
        if (
            imports.blocs.length === 0 &&
            imports.themeTokens.length === 0 &&
            (imports.texts?.length ?? 0) === 0 &&
            (imports.assets?.length ?? 0) === 0 &&
            (imports.pages?.length ?? 0) === 0
        ) {
            invalid("must import at least one collection resource", `${path}.imports`);
        }
        return {
            collectionId,
            publisherId: contractIdentifier(source.publisherId, 96, `${path}.publisherId`),
            versionRange,
            imports,
        };
    });
    unique(
        dependencies.map((dependency) => dependency.collectionId),
        "$.dependencies",
    );
    return dependencies.sort((left, right) => ordinal(left.collectionId, right.collectionId));
}

function parseResourceImports(
    value: unknown,
    collectionId: string,
    path: string,
    limits: Readonly<CollectionLimits>,
): CollectionResourceImportSelection {
    const source = record(value, path);
    keys(source, ["blocs", "themeTokens", "texts", "assets", "pages"], path);
    return {
        blocs: importedResources(source.blocs, limits.maxBlocs, `${path}.blocs`, (entry, at) =>
            parseCollectionBlocTag(entry, collectionId, at),
        ),
        themeTokens: importedResources(
            source.themeTokens,
            limits.maxThemeTokens,
            `${path}.themeTokens`,
            (entry, at) => {
                const token = string(entry, 96, at);
                try {
                    collectionThemeTokenId(collectionId, token);
                    return token;
                } catch {
                    return invalid("must be a lowercase kebab-case token ID", at);
                }
            },
        ),
        ...optionalImports(source.texts, limits.maxTexts, `${path}.texts`, (entry) => textIdentifier(entry)),
        ...optionalImports(source.assets, limits.maxAssets, `${path}.assets`, assetIdentifier),
        ...optionalImports(source.pages, limits.maxPages, `${path}.pages`, (entry, at) => identifier(entry, at)),
    };
}

function optionalImports(
    value: unknown,
    maximum: number,
    path: string,
    parseId: (value: unknown, path: string) => string,
): Partial<Record<"texts" | "assets" | "pages", readonly CollectionResourceImport[]>> {
    const resources = importedResources(value, maximum, path, parseId);
    const property = path.endsWith(".texts") ? "texts" : path.endsWith(".assets") ? "assets" : "pages";
    return resources.length ? { [property]: resources } : {};
}

function importedResources(
    value: unknown,
    maximum: number,
    path: string,
    parseId: (value: unknown, path: string) => string,
): CollectionResourceImport[] {
    const resources = array(value ?? [], maximum, path).map((entry, index) => {
        const at = `${path}[${index}]`;
        const source = record(entry, at);
        keys(source, ["id", "generation"], at);
        return {
            id: parseId(source.id, `${at}.id`),
            generation: integer(source.generation, 1, Number.MAX_SAFE_INTEGER, `${at}.generation`),
        };
    });
    unique(
        resources.map(({ id }) => id),
        path,
    );
    return resources.sort((left, right) => ordinal(left.id, right.id));
}

export function parseCollectionExports(
    value: unknown,
    collectionId: string,
    limits: Readonly<CollectionLimits>,
): CollectionResourceSelection {
    return parseResourceSelection(value, collectionId, "$.exports", limits);
}

export function validateCollectionExports(
    exports: CollectionResourceSelection,
    blocIds: ReadonlySet<string>,
    themeTokenIds: ReadonlySet<string>,
    textIds: ReadonlySet<string>,
    assetIds: ReadonlySet<string>,
    pageIds: ReadonlySet<string>,
): void {
    for (const bloc of exports.blocs) {
        if (!blocIds.has(bloc)) {
            invalid(`unknown exported bloc ${bloc}`, "$.exports.blocs");
        }
    }
    for (const token of exports.themeTokens) {
        if (!themeTokenIds.has(token)) {
            invalid(`unknown exported theme token ${token}`, "$.exports.themeTokens");
        }
    }
    for (const text of exports.texts ?? []) {
        if (!textIds.has(text)) {
            invalid(`unknown exported text ${text}`, "$.exports.texts");
        }
    }
    for (const asset of exports.assets ?? []) {
        if (!assetIds.has(asset)) {
            invalid(`unknown exported asset ${asset}`, "$.exports.assets");
        }
    }
    for (const page of exports.pages ?? []) {
        if (!pageIds.has(page)) {
            invalid(`unknown exported page ${page}`, "$.exports.pages");
        }
    }
}

function parseResourceSelection(
    value: unknown,
    collectionId: string,
    path: string,
    limits: Readonly<CollectionLimits>,
): CollectionResourceSelection {
    const source = record(value, path);
    keys(source, ["blocs", "themeTokens", "texts", "assets", "pages"], path);
    const blocs = array(source.blocs ?? [], limits.maxBlocs, `${path}.blocs`).map((entry, index) =>
        parseCollectionBlocTag(entry, collectionId, `${path}.blocs[${index}]`),
    );
    const themeTokens = array(source.themeTokens ?? [], limits.maxThemeTokens, `${path}.themeTokens`).map(
        (entry, index) => {
            const token = string(entry, 96, `${path}.themeTokens[${index}]`);
            try {
                collectionThemeTokenId(collectionId, token);
                return token;
            } catch {
                return invalid("must be a lowercase kebab-case token ID", `${path}.themeTokens[${index}]`);
            }
        },
    );
    const texts = array(source.texts ?? [], limits.maxTexts, `${path}.texts`).map((entry, index) => {
        try {
            return textIdentifier(entry);
        } catch {
            return invalid("must be a lowercase kebab-case text ID", `${path}.texts[${index}]`);
        }
    });
    const assets = array(source.assets ?? [], limits.maxAssets, `${path}.assets`).map((entry, index) =>
        assetIdentifier(entry, `${path}.assets[${index}]`),
    );
    const pages = array(source.pages ?? [], limits.maxPages, `${path}.pages`).map((entry, index) =>
        identifier(entry, `${path}.pages[${index}]`),
    );
    unique(blocs, `${path}.blocs`);
    unique(themeTokens, `${path}.themeTokens`);
    unique(texts, `${path}.texts`);
    unique(assets, `${path}.assets`);
    unique(pages, `${path}.pages`);
    return {
        blocs: blocs.sort(ordinal),
        themeTokens: themeTokens.sort(ordinal),
        ...(texts.length ? { texts: texts.sort(ordinal) } : {}),
        ...(assets.length ? { assets: assets.sort(ordinal) } : {}),
        ...(pages.length ? { pages: pages.sort(ordinal) } : {}),
    };
}

function assetIdentifier(value: unknown, path: string): string {
    return identifier(value, path);
}

function contractIdentifier(value: unknown, maximum: number, path: string): string {
    const parsed = string(value, maximum, path);
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/.test(parsed)) {
        invalid("must be a canonical contract or capability identifier", path);
    }
    return parsed;
}
