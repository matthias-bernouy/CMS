import type { ContractFixtureAssetDefinition } from "../../interfaces/ContractRelease";
import { ReleaseValidationError } from "../protocol/errors";
import type { ContractBundleAsset } from "./admitContractBundle";
import type { VerifiedFixtureAsset } from "./admitContractRelease";

export interface SnapshottedFixtureAsset {
    readonly id: string;
    readonly bytes: Blob;
}

/** Copies every caller-owned buffer synchronously so later digest work observes one immutable input set. */
export function snapshotFixtureAssets(assets: readonly ContractBundleAsset[]): readonly SnapshottedFixtureAsset[] {
    return Object.freeze(
        assets.map((asset) => {
            const value = asset.bytes;
            if (!(value instanceof Blob || value instanceof Uint8Array)) {
                throw new ReleaseValidationError("invalid_contract", "invalid fixture asset bytes", "$.fixtureAssets");
            }
            const bytes = value instanceof Blob ? new Blob([value]) : new Blob([value.slice()]);
            return Object.freeze({ id: asset.id, bytes });
        }),
    );
}

/** Take immutable snapshots and verify the exact declared byte set. */
export async function verifyFixtureAssets(
    declarations: readonly ContractFixtureAssetDefinition[],
    assets: readonly ContractBundleAsset[],
): Promise<readonly VerifiedFixtureAsset[]> {
    const snapshots = snapshotFixtureAssets(assets);
    if (
        snapshots.length !== declarations.length ||
        new Set(snapshots.map((asset) => asset.id)).size !== snapshots.length
    ) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "fixture asset set does not match declaration",
            "$.fixtureAssets",
        );
    }
    const supplied = new Map(snapshots.map((asset) => [asset.id, asset.bytes]));
    const verified: VerifiedFixtureAsset[] = [];
    for (const declaration of declarations) {
        const value = supplied.get(declaration.id);
        if (!(value instanceof Blob)) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "missing fixture asset bytes",
                `$.fixtureAssets.${declaration.id}`,
            );
        }
        if (value.size !== declaration.byteLength) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "fixture asset size mismatch",
                `$.fixtureAssets.${declaration.id}`,
            );
        }
        const bytes = value;
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
    return Object.freeze(verified);
}
