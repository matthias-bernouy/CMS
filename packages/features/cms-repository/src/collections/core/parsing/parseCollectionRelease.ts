import { canonicalIJsonBytes, deepFreeze, parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { satisfiesVersionRange } from "cms-repository/exports/contracts/compatibility";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { CollectionValidationError, invalid, translateCollectionError } from "../errors";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits, type CollectionLimits } from "../limits";
import { identifier, integer, keys, record, string } from "../values";
import { parseCollectionNamespace } from "../namespace";
import { parseCollectionTheme } from "./theme";
import { parseCollectionTexts } from "../texts/parseCollectionTexts";
import { parseAssets } from "./assets";
import { parseBlocs } from "./blocs/parseBlocs";
import { validateBlocs } from "./blocs/validateBlocs";
import { parseConfiguration } from "./configuration";
import { parseCollectionViews } from "./views";
import { parseCollectionDashboards } from "./dashboards";
import { validateCollectionTextReferences } from "../validation/markup/texts";
import { parseCollectionTranslations } from "../texts/translationCatalogue";
import { validateCollectionTranslationReferences } from "../texts/translationReferences";
import { parseCollectionDependencies, parseCollectionExports, validateCollectionExports } from "./requirements";
import { parseCollectionMigrations } from "../admission/releaseMigrations";
import { validateCollectionAssetReferences } from "../validation/markup/assets";

export function parseCollectionRelease(
    value: unknown,
    options: Readonly<CollectionLimits> = DEFAULT_COLLECTION_LIMITS,
): CollectionRelease {
    const limits = normalizeCollectionLimits(options);
    try {
        assertSize(value, limits);
        const source = record(structuredClone(value), "$");
        keys(
            source,
            [
                "kind",
                "protocol",
                "schemaDialect",
                "collectionId",
                "publisherId",
                "version",
                "dataGeneration",
                "migrations",
                "name",
                "description",
                "locale",
                "translations",
                "exports",
                "dependencies",
                "configuration",
                "texts",
                "theme",
                "assets",
                "blocs",
                "views",
                "dashboards",
            ],
            "$",
        );
        for (const [key, expected] of Object.entries({
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
        })) {
            if (source[key] !== expected) {
                invalid(`must be ${expected}`, `$.${key}`);
            }
        }
        const collectionId = parseCollectionNamespace(source.collectionId, "$.collectionId");
        const version = parseVersion(source.version);
        const dataGeneration =
            source.dataGeneration === undefined
                ? 1
                : integer(source.dataGeneration, 1, Number.MAX_SAFE_INTEGER, "$.dataGeneration");
        const migrations = parseCollectionMigrations(source.migrations ?? [], collectionId, dataGeneration, limits);
        const locale = parseLocale(source.locale);
        const translations = parseCollectionTranslations(source.translations, locale);
        const texts = source.texts === undefined ? undefined : parseTexts(source.texts, locale, limits);
        const assets = parseAssets(source.assets === undefined ? [] : source.assets, limits);
        const dependencies =
            source.dependencies === undefined
                ? undefined
                : parseCollectionDependencies(source.dependencies, collectionId, limits);
        const blocs = parseBlocs(source.blocs === undefined ? [] : source.blocs, collectionId, limits);
        validateBlocs(
            blocs,
            new Set(assets.map((asset) => asset.id)),
            limits,
            new Set(dependencies?.flatMap((dependency) => dependency.imports.blocs.map(({ id }) => id)) ?? []),
        );
        const views =
            source.views === undefined
                ? undefined
                : parseCollectionViews(
                      source.views,
                      new Set([
                          ...blocs.map((bloc) => bloc.id),
                          ...(dependencies?.flatMap((dependency) => dependency.imports.blocs.map(({ id }) => id)) ??
                              []),
                      ]),
                      limits,
                  );
        validateCollectionTextReferences(
            blocs,
            collectionId,
            new Set(texts?.map((text) => text.id) ?? []),
            new Map(
                (dependencies ?? []).map((dependency) => [
                    dependency.collectionId,
                    new Set(dependency.imports.texts?.map(({ id }) => id) ?? []),
                ]),
            ),
            views,
        );
        validateCollectionAssetReferences(
            blocs,
            collectionId,
            new Set(assets.map((asset) => asset.id)),
            new Map(
                (dependencies ?? []).map((dependency) => [
                    dependency.collectionId,
                    new Set(dependency.imports.assets?.map(({ id }) => id) ?? []),
                ]),
            ),
            views,
        );
        const theme =
            source.theme === undefined
                ? undefined
                : parseCollectionTheme(source.theme, collectionId, limits, dependencies ?? []);
        const exports =
            source.exports === undefined ? undefined : parseCollectionExports(source.exports, collectionId, limits);
        if (exports) {
            validateCollectionExports(
                exports,
                new Set(blocs.map((bloc) => bloc.id)),
                new Set(theme?.categories.flatMap((category) => category.tokens.map((token) => token.id)) ?? []),
                new Set(texts?.map((text) => text.id) ?? []),
                new Set(assets.map((asset) => asset.id)),
            );
        }
        const release: CollectionRelease = {
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId,
            publisherId: identifier(source.publisherId, "$.publisherId"),
            version,
            dataGeneration,
            migrations,
            name: string(source.name, 128, "$.name"),
            ...(source.description === undefined
                ? {}
                : { description: string(source.description, 4096, "$.description") }),
            locale,
            translations,
            ...(exports === undefined ? {} : { exports }),
            ...(dependencies === undefined ? {} : { dependencies }),
            ...(texts === undefined ? {} : { texts }),
            ...(theme === undefined ? {} : { theme }),
            ...(source.configuration === undefined
                ? {}
                : { configuration: parseConfiguration(source.configuration, "$.configuration", limits) }),
            assets,
            blocs,
            ...(views === undefined ? {} : { views }),
            ...(source.dashboards === undefined
                ? {}
                : {
                      dashboards: parseCollectionDashboards(
                          source.dashboards,
                          new Set(views?.map((view) => view.id) ?? []),
                          limits,
                      ),
                  }),
        };
        validateCollectionTranslationReferences(release);
        assertSize(release, limits);
        return deepFreeze(release);
    } catch (error) {
        return translateCollectionError(error);
    }
}

export function parseCollectionReleaseJson(
    input: string | Uint8Array,
    options: Readonly<CollectionLimits> = DEFAULT_COLLECTION_LIMITS,
): CollectionRelease {
    const limits = normalizeCollectionLimits(options);
    try {
        return parseCollectionRelease(parseStrictJson(input, limits.maxDocumentBytes, limits.maxJsonDepth), limits);
    } catch (error) {
        return translateCollectionError(error);
    }
}

function assertSize(value: unknown, limits: Readonly<CollectionLimits>): void {
    if (canonicalIJsonBytes(value, limits.maxJsonDepth).byteLength > limits.maxDocumentBytes) {
        throw new CollectionValidationError("body_limit_exceeded", "collection exceeds document byte limit");
    }
}

function parseLocale(value: unknown): string {
    const locale = string(value, 64, "$.locale");
    try {
        return Intl.getCanonicalLocales(locale)[0]!;
    } catch {
        return invalid("must be a BCP 47 locale", "$.locale");
    }
}

function parseVersion(value: unknown): string {
    const version = string(value, 128, "$.version");
    try {
        if (satisfiesVersionRange(version, version)) {
            return version;
        }
    } catch {
        // Report release identity errors at the release field, not at an internal range helper.
    }
    return invalid("must be an exact canonical SemVer", "$.version");
}

function parseTexts(value: unknown, locale: string, limits: Readonly<CollectionLimits>) {
    try {
        return parseCollectionTexts(value, locale, limits.maxTexts);
    } catch (error) {
        throw new CollectionValidationError(
            "invalid_collection",
            error instanceof Error ? error.message : "Invalid texts",
            "$.texts",
        );
    }
}
