import { canonicalIJsonBytes, deepFreeze, parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { satisfiesVersionRange } from "cms-repository/exports/contracts/compatibility";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { CollectionValidationError, invalid, translateCollectionError } from "../errors";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits, type CollectionLimits } from "../limits";
import { identifier, keys, record, string } from "../values";
import { parseCollectionTheme } from "./theme";
import { parseCollectionTexts } from "../texts/parseCollectionTexts";
import { parseAssets } from "./assets";
import { parseBlocs } from "./blocs/parseBlocs";
import { validateBlocs } from "./blocs/validateBlocs";
import { parseConfiguration } from "./configuration";

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
                "name",
                "description",
                "locale",
                "configuration",
                "texts",
                "theme",
                "assets",
                "blocs",
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
        const collectionId = identifier(source.collectionId, "$.collectionId");
        const version = parseVersion(source.version);
        const assets = parseAssets(source.assets === undefined ? [] : source.assets, limits);
        const blocs = parseBlocs(source.blocs === undefined ? [] : source.blocs, collectionId, limits);
        validateBlocs(blocs, new Set(assets.map((asset) => asset.id)), limits);
        const release: CollectionRelease = {
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId,
            publisherId: identifier(source.publisherId, "$.publisherId"),
            version,
            name: string(source.name, 128, "$.name"),
            ...(source.description === undefined
                ? {}
                : { description: string(source.description, 4096, "$.description") }),
            locale: parseLocale(source.locale),
            ...(source.texts === undefined ? {} : { texts: parseTexts(source.texts, parseLocale(source.locale)) }),
            ...(source.theme === undefined ? {} : { theme: parseCollectionTheme(source.theme) }),
            ...(source.configuration === undefined
                ? {}
                : { configuration: parseConfiguration(source.configuration, "$.configuration", limits) }),
            assets,
            blocs,
        };
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

function parseTexts(value: unknown, locale: string) {
    try {
        return parseCollectionTexts(value, locale);
    } catch (error) {
        throw new CollectionValidationError(
            "invalid_collection",
            error instanceof Error ? error.message : "Invalid texts",
            "$.texts",
        );
    }
}
