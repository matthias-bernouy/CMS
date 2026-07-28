import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { IntegrationVerificationContractError } from "../validation/errors";
import { parseVerificationJsonDocument } from "../validation/document";

export const MAX_VERIFICATION_CONTROL_DOCUMENT_BYTES = 1_048_576;

export function parseVerificationControlDocument(input: string | Uint8Array): unknown {
    return parseVerificationJsonDocument(input, MAX_VERIFICATION_CONTROL_DOCUMENT_BYTES);
}

export async function identifyCanonicalVerificationContract<T>(
    value: T,
): Promise<Readonly<{ value: T; canonicalBytes: Uint8Array; digest: string }>> {
    const canonicalBytes = canonicalJsonBytes(value);
    if (canonicalBytes.byteLength > MAX_VERIFICATION_CONTROL_DOCUMENT_BYTES) {
        throw new IntegrationVerificationContractError(
            "limit_exceeded",
            `canonical verification control document exceeds ${MAX_VERIFICATION_CONTROL_DOCUMENT_BYTES} bytes`,
        );
    }
    return { value, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

export function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

export function samePinnedRunner(
    left: Readonly<{ name: string; version: string; imageDigest: string }>,
    right: Readonly<{ name: string; version: string; imageDigest: string }>,
): boolean {
    return left.name === right.name && left.version === right.version && left.imageDigest === right.imageDigest;
}

export function invalidReference(field: string, message: string): never {
    throw new IntegrationVerificationContractError("invalid_reference", `${field} ${message}`, field);
}
