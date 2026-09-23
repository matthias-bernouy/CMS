import { ReleaseValidationError } from "./protocol/errors";
import type { ReleaseLimits } from "./protocol/limits";
import { admitContractRelease, type AdmittedContractRelease } from "./admission/admitContractRelease";

export async function verifyAdmission(
    admission: AdmittedContractRelease,
    limits: Readonly<ReleaseLimits>,
): Promise<AdmittedContractRelease> {
    if (admission.kind !== "admitted-contract-release") {
        throw new ReleaseValidationError("invalid_contract", "catalogue accepts only admitted releases");
    }
    const verified = await admitContractRelease(admission.release, limits);
    if (verified.digest !== admission.digest || verified.canonicalJson !== admission.canonicalJson) {
        throw new ReleaseValidationError("invalid_contract", "admitted release artifact failed integrity verification");
    }
    return verified;
}
