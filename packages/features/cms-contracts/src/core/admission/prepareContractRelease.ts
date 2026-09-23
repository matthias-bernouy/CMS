import { canonicalizeIJson } from "../protocol/canonical";
import { parseStrictJson } from "../protocol/json";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import { deepFreeze } from "../protocol/values";
import type { ContractRelease } from "../../interfaces/ContractRelease";
import type { CompiledCapabilityBinding } from "../../interfaces/HttpBinding";
import { compileContractBindings } from "../bindings/compileContractBindings";
import { parseContractRelease } from "../parsing/parseContractRelease";

export interface PreparedContractRelease {
    readonly bindings: readonly CompiledCapabilityBinding[];
    readonly canonicalJson: string;
    readonly release: ContractRelease;
}

export function prepareContractRelease(
    value: unknown,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): PreparedContractRelease {
    const release = parseContractRelease(value, limits);
    const prepared = {
        release,
        bindings: compileContractBindings(release),
        canonicalJson: canonicalizeIJson(release, limits.maxJsonDepth),
    };
    return deepFreeze(prepared) as PreparedContractRelease;
}

export function prepareContractReleaseJson(
    input: string | Uint8Array,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): PreparedContractRelease {
    const value = parseStrictJson(input, limits.maxDocumentBytes, limits.maxJsonDepth);
    return prepareContractRelease(value, limits);
}
