import type { ReleaseDigest } from "./digest";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import { ReleaseValidationError } from "../protocol/errors";
import type { PreparedContractRelease } from "./prepareContractRelease";
import { prepareContractRelease, prepareContractReleaseJson } from "./prepareContractRelease";

const encoder = new TextEncoder();

export interface AdmittedContractRelease extends PreparedContractRelease {
    readonly digest: ReleaseDigest;
    readonly kind: "admitted-contract-release";
    readonly fixtureAssets?: readonly VerifiedFixtureAsset[];
}

export interface VerifiedFixtureAsset {
    readonly id: string;
    readonly bytes: Blob;
}

export async function admitContractRelease(
    value: unknown,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<AdmittedContractRelease> {
    const prepared = prepareContractRelease(value, limits);
    requireNoFixtureAssets(prepared);
    return admitPreparedRelease(prepared);
}

export async function admitContractReleaseJson(
    input: string | Uint8Array,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<AdmittedContractRelease> {
    const prepared = prepareContractReleaseJson(input, limits);
    requireNoFixtureAssets(prepared);
    return admitPreparedRelease(prepared);
}

/** Rebuild persisted release identity without hydrating separately stored fixture bytes. */
export async function verifyStoredContractReleaseJson(
    input: string | Uint8Array,
    expectedDigest: unknown,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<AdmittedContractRelease> {
    const admitted = await admitPreparedRelease(prepareContractReleaseJson(input, limits));
    if (typeof expectedDigest !== "string" || admitted.digest !== expectedDigest) {
        throw new ReleaseValidationError("invalid_contract", "stored contract release digest mismatch", "$.digest");
    }
    return admitted;
}

function requireNoFixtureAssets(prepared: PreparedContractRelease): void {
    if (prepared.release.fixtureAssets?.length) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "fixture assets require admitContractBundle",
            "$.fixtureAssets",
        );
    }
}

export async function admitPreparedRelease(
    prepared: PreparedContractRelease,
    fixtureAssets?: readonly VerifiedFixtureAsset[],
): Promise<AdmittedContractRelease> {
    const bytes = encoder.encode(prepared.canonicalJson);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
    return Object.freeze({
        kind: "admitted-contract-release",
        ...prepared,
        digest: `sha256:${hex(new Uint8Array(digest))}` as ReleaseDigest,
        ...(fixtureAssets === undefined ? {} : { fixtureAssets }),
    });
}

function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
