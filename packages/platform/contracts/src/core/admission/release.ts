import type { ReleaseLimits } from "../protocol/limits";
import { DEFAULT_RELEASE_LIMITS } from "../protocol/limits";
import { prepareContractRelease } from "./prepareContractRelease";

const encoder = new TextEncoder();

export function canonicalizeRelease(value: unknown, limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS): string {
    return prepareContractRelease(value, limits).canonicalJson;
}

export function canonicalReleaseBytes(
    value: unknown,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Uint8Array {
    return encoder.encode(prepareContractRelease(value, limits).canonicalJson);
}
