import { canonicalJsonBytes } from "../../../core/canonical/canonicalizeJson";
import { sha256Hex } from "../../../core/digest";
import { validateIntegrationPackageEnvelope } from "../../../core/envelope/validate";
import type { IntegrationPackageLimits } from "../../../interfaces/envelope";
import type { ResolvedIntegrationPackage } from "../../../interfaces/source";
import type { ExpectedIntegrationPackageIdentity } from "./types";

export type PreparedIntegrationPackage = ResolvedIntegrationPackage & {
    readonly canonicalBytes: Uint8Array;
};

export async function prepareIntegrationPackage(
    input: ResolvedIntegrationPackage,
    expected: ExpectedIntegrationPackageIdentity,
    limits: Partial<IntegrationPackageLimits> | undefined,
): Promise<PreparedIntegrationPackage> {
    const envelope = validateIntegrationPackageEnvelope(input.envelope, { limits });
    const canonicalBytes = canonicalJsonBytes(envelope);
    if (!equalPackageBytes(canonicalBytes, input.canonicalBytes)) {
        throw new Error("Integration package source bytes are not the canonical envelope");
    }
    const digest = await sha256Hex(canonicalBytes);
    if (input.digest !== digest || (expected.digest !== undefined && expected.digest !== digest)) {
        throw new Error("Integration package source digest does not match canonical content");
    }
    if (expected.kind !== undefined && envelope.kind !== expected.kind) {
        throw new Error(`Integration package kind must be ${JSON.stringify(expected.kind)}`);
    }
    if (expected.version !== undefined && envelope.version !== expected.version) {
        throw new Error(`Integration package version must be ${JSON.stringify(expected.version)}`);
    }
    return { envelope, canonicalBytes, digest };
}

export function equalPackageBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
