import type { ReleaseDigest } from "./digest";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import type { PreparedContractRelease } from "./prepareContractRelease";
import { prepareContractRelease, prepareContractReleaseJson } from "./prepareContractRelease";

const encoder = new TextEncoder();

export interface AdmittedContractRelease extends PreparedContractRelease {
    readonly digest: ReleaseDigest;
    readonly kind: "admitted-contract-release";
}

export async function admitContractRelease(
    value: unknown,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<AdmittedContractRelease> {
    return admitPreparedRelease(prepareContractRelease(value, limits));
}

export async function admitContractReleaseJson(
    input: string | Uint8Array,
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<AdmittedContractRelease> {
    return admitPreparedRelease(prepareContractReleaseJson(input, limits));
}

async function admitPreparedRelease(prepared: PreparedContractRelease): Promise<AdmittedContractRelease> {
    const bytes = encoder.encode(prepared.canonicalJson);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
    return Object.freeze({
        kind: "admitted-contract-release",
        ...prepared,
        digest: `sha256:${hex(new Uint8Array(digest))}` as ReleaseDigest,
    });
}

function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
