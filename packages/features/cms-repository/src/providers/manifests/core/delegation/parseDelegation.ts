import type { ProviderDelegationPolicy, ProviderDelegationSelector } from "../../interfaces/ProviderManifest";
import { ProviderManifestValidationError } from "../protocol/errors";
import {
    expectArray,
    expectBoolean,
    expectRecord,
    rejectUnknownKeys,
    unique,
    compareOrdinal,
} from "../protocol/values";
import { parseIdentifier } from "../parsing/identifiers";

export function parseDelegation(value: unknown, path: string): ProviderDelegationPolicy {
    const record = expectRecord(value, path);
    rejectUnknownKeys(record, ["sources", "allow"], path);
    const sources = expectArray(record.sources, `${path}.sources`, 256).map((source, index) =>
        selectorId(source, `${path}.sources[${index}]`, 128),
    );
    unique(sources, `${path}.sources`);
    if (!sources.length || (sources.includes("*") && sources.length !== 1)) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "sources must be non-empty; wildcard must stand alone",
            `${path}.sources`,
        );
    }
    const allow = expectArray(record.allow, `${path}.allow`, 128).map((value, index): ProviderDelegationSelector => {
        const at = `${path}.allow[${index}]`;
        const selector = expectRecord(value, at);
        rejectUnknownKeys(selector, ["contractId", "capabilityId", "effect", "sensitive"], at);
        if (selector.effect !== "query" && selector.effect !== "command" && selector.effect !== "*") {
            throw new ProviderManifestValidationError(
                "invalid_manifest",
                "effect must be query, command or *",
                `${at}.effect`,
            );
        }
        return {
            contractId: selectorId(selector.contractId, `${at}.contractId`, 96),
            capabilityId: selectorId(selector.capabilityId, `${at}.capabilityId`, 128),
            effect: selector.effect,
            ...(selector.sensitive === undefined
                ? {}
                : { sensitive: expectBoolean(selector.sensitive, `${at}.sensitive`) }),
        };
    });
    if (!allow.length) {
        throw new ProviderManifestValidationError("invalid_manifest", "allow must not be empty", `${path}.allow`);
    }
    const key = (selector: ProviderDelegationSelector) => JSON.stringify(selector);
    unique(allow.map(key), `${path}.allow`);
    return {
        sources: sources.sort(compareOrdinal),
        allow: allow.sort((left, right) => compareOrdinal(key(left), key(right))),
    };
}

function selectorId(value: unknown, path: string, maximum: number): string {
    return value === "*" ? "*" : parseIdentifier(value, path, maximum);
}
