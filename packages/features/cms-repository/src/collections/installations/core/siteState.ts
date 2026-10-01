import { canonicalIJsonBytes } from "cms-repository/exports/contracts/protocol";
import { validateSchemaValue } from "cms-repository/exports/contracts/schema";
import { parseCollectionNamespace } from "../../core/namespace";
import { parseCollectionTextOverrides } from "../../core/texts/parseCollectionTexts";
import { array, identifier, keys, record } from "../../core/values";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import type { CollectionInstallation, CollectionSiteState } from "../interfaces/store";

const MAX_INSTALLATIONS = 256;
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function parseCollectionSiteState(value: unknown): CollectionSiteState {
    if (canonicalIJsonBytes(value, 64).byteLength > MAX_STATE_BYTES) {
        throw new TypeError("Collection site state exceeds its byte limit");
    }
    const source = record(structuredClone(value), "$state");
    keys(source, ["revision", "installations"], "$state");
    if (!Number.isSafeInteger(source.revision) || (source.revision as number) < 0) {
        throw new TypeError("Collection site revision must be a nonnegative safe integer");
    }
    const installations = array(source.installations, MAX_INSTALLATIONS, "$state.installations").map(parseInstallation);
    if (new Set(installations.map((installation) => installation.collectionId)).size !== installations.length) {
        throw new TypeError("Collection site state contains duplicate installations");
    }
    return { revision: source.revision as number, installations };
}

function parseInstallation(value: unknown, index: number): CollectionInstallation {
    const path = `$state.installations[${index}]`;
    const source = record(value, path);
    keys(source, ["collectionId", "digest", "repositoryId", "configuration", "textOverrides"], path);
    const digest = source.digest;
    if (typeof digest !== "string" || !DIGEST.test(digest)) {
        throw new TypeError(`${path}.digest must be a SHA-256 digest`);
    }
    return {
        collectionId: parseCollectionNamespace(source.collectionId, `${path}.collectionId`),
        digest,
        ...(source.repositoryId === undefined
            ? {}
            : { repositoryId: identifier(source.repositoryId, `${path}.repositoryId`) }),
        configuration: record(source.configuration, `${path}.configuration`),
        textOverrides: record(source.textOverrides, `${path}.textOverrides`) as CollectionInstallation["textOverrides"],
    };
}

export function validateStoredCollectionInstallation(
    installation: CollectionInstallation,
    release: CollectionRelease,
): CollectionInstallation {
    if (release.configuration) {
        try {
            validateSchemaValue(release.configuration.schema, installation.configuration);
        } catch (error) {
            throw new TypeError(
                `Stored collection configuration is invalid: ${error instanceof Error ? error.message : "schema mismatch"}`,
            );
        }
    } else if (Object.keys(installation.configuration).length > 0) {
        throw new TypeError("Stored collection has configuration without a declared schema");
    }
    return {
        ...installation,
        configuration: structuredClone(installation.configuration),
        textOverrides: parseCollectionTextOverrides(installation.textOverrides, release.texts ?? []),
    };
}
