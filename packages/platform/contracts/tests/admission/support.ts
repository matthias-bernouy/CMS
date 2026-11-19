import { admitPreparedRelease } from "ulvia-contracts/core/admission/admitContractRelease";
import { prepareContractReleaseJson } from "ulvia-contracts/core/admission/prepareContractRelease";
import { ReleaseValidationError } from "ulvia-contracts/core/protocol/errors";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import type { AdmittedContractRelease, ReleaseLimits } from "@bernouy/ulvia-contracts";
import { contractDocument } from "../support/fixtures";

// Exact pre-optimization verifier: differential tests preserve validation order and failure details.
export async function referenceVerification(
    input: string | Uint8Array,
    digest: unknown,
    limits = DEFAULT_RELEASE_LIMITS,
) {
    const admitted = await admitPreparedRelease(prepareContractReleaseJson(input, limits));
    if (typeof digest !== "string" || admitted.digest !== digest) {
        throw new ReleaseValidationError("invalid_contract", "stored contract release digest mismatch", "$.digest");
    }
    return admitted;
}

export async function fixture(overrides: Record<string, unknown> = {}) {
    return admitPreparedRelease(prepareContractReleaseJson(JSON.stringify(contractDocument(overrides))));
}

export async function outcome(
    input: string | Uint8Array,
    digest: unknown,
    limits: Readonly<ReleaseLimits>,
    verify: (
        input: string | Uint8Array,
        digest: unknown,
        limits: Readonly<ReleaseLimits>,
    ) => Promise<AdmittedContractRelease> = referenceVerification,
) {
    try {
        return { value: await verify(input, digest, limits) };
    } catch (error) {
        if (!(error instanceof Error)) {
            throw error;
        }
        return { ...error, name: error.name, message: error.message };
    }
}
