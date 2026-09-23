import { ReleaseValidationError } from "../protocol/errors";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../protocol/limits";
import { prepareContractRelease, prepareContractReleaseJson } from "./prepareContractRelease";
import { admitPreparedRelease, type AdmittedContractRelease, type VerifiedFixtureAsset } from "./admitContractRelease";
import type { PreparedContractRelease } from "./prepareContractRelease";

export interface ContractBundleAsset {
    readonly id: string;
    readonly bytes: Blob | Uint8Array;
}

export async function admitContractBundle(
    release: unknown,
    assets: readonly ContractBundleAsset[],
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<AdmittedContractRelease> {
    return admitPreparedReleaseWithAssets(prepareContractRelease(release, limits), assets);
}

export async function admitContractBundleJson(
    input: string | Uint8Array,
    assets: readonly ContractBundleAsset[],
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
): Promise<AdmittedContractRelease> {
    return admitPreparedReleaseWithAssets(prepareContractReleaseJson(input, limits), assets);
}

async function admitPreparedReleaseWithAssets(
    prepared: PreparedContractRelease,
    assets: readonly ContractBundleAsset[],
): Promise<AdmittedContractRelease> {
    const declarations = prepared.release.fixtureAssets ?? [];
    if (assets.length !== declarations.length || new Set(assets.map((asset) => asset.id)).size !== assets.length) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "fixture asset set does not match release declaration",
            "$.fixtureAssets",
        );
    }
    const supplied = new Map(assets.map((asset) => [asset.id, asset.bytes]));
    const verified: VerifiedFixtureAsset[] = [];
    for (const declaration of declarations) {
        const value = supplied.get(declaration.id);
        if (!(value instanceof Blob || value instanceof Uint8Array)) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "missing fixture asset bytes",
                `$.fixtureAssets.${declaration.id}`,
            );
        }
        const size = value instanceof Blob ? value.size : value.byteLength;
        if (size !== declaration.byteLength) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "fixture asset size mismatch",
                `$.fixtureAssets.${declaration.id}`,
            );
        }
        const bytes = value instanceof Blob ? new Blob([value]) : new Blob([value.slice().buffer as ArrayBuffer]);
        const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", await bytes.arrayBuffer()));
        const digest = `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
        if (digest !== declaration.digest) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "fixture asset digest mismatch",
                `$.fixtureAssets.${declaration.id}`,
            );
        }
        verified.push(Object.freeze({ id: declaration.id, bytes: Object.freeze(bytes) }));
    }
    return admitPreparedRelease(prepared, Object.freeze(verified));
}
