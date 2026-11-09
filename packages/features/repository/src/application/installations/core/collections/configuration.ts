import type { InstallationServices } from "repository/application/installations/interfaces/services";
import type { UpdateCollectionConfigurationInput } from "repository/application/installations/interfaces/inputs";
import { projectSnapshot } from "./projection";
import { assertResourceCounts } from "./resourceBounds";
import {
    MAX_CAPABILITY_JSON_BYTES,
    MAX_CAPABILITY_JSON_DEPTH,
    parseStrictJson,
} from "@bernouy/ulvia-contracts/protocol";
import { InstallationError } from "repository/application/installations/core/errors";
export function parseConfiguration(value: string): unknown {
    return parseStrictJson(new TextEncoder().encode(value), MAX_CAPABILITY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH);
}
export function configurationObject(value: string): Record<string, unknown> {
    const parsed = parseConfiguration(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new InstallationError("INVALID_INPUT");
    }
    return parsed as Record<string, unknown>;
}
export function textOverrides(value: string): Record<string, Record<string, string>> {
    const parsed = configurationObject(value);
    const result: Record<string, Record<string, string>> = {};
    for (const [locale, entry] of Object.entries(parsed)) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new InstallationError("INVALID_INPUT");
        }
        const strings: Record<string, string> = {};
        for (const [key, text] of Object.entries(entry)) {
            if (typeof text !== "string") {
                throw new InstallationError("INVALID_INPUT");
            }
            Object.defineProperty(strings, key, { value: text, enumerable: true });
        }
        Object.defineProperty(result, locale, { value: strings, enumerable: true });
    }
    return result;
}

export async function configureCollection(
    services: InstallationServices,
    siteId: string,
    input: UpdateCollectionConfigurationInput,
    maximumResourceCount = 4096,
) {
    const before = await services.collections.listInstalled(siteId);
    if (before.revision !== input.expectedRevision) {
        throw new InstallationError("REVISION_CONFLICT");
    }
    assertResourceCounts(before.items, maximumResourceCount);
    return projectSnapshot(
        await services.collections.saveConfiguration(
            siteId,
            input.collectionId,
            input.expectedRevision,
            parseConfiguration(input.configurationJson),
        ),
    );
}
