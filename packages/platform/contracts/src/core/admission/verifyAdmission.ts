import { ReleaseValidationError } from "ulvia-contracts/core/protocol/errors";
import type { ReleaseLimits } from "ulvia-contracts/core/protocol/limits";
import {
    admitContractRelease,
    type AdmittedContractRelease,
} from "ulvia-contracts/core/admission/admitContractRelease";
import { admitContractBundle } from "./admitContractBundle";

export async function verifyAdmission(
    admission: AdmittedContractRelease,
    limits: Readonly<ReleaseLimits>,
): Promise<AdmittedContractRelease> {
    if (admission.kind !== "admitted-contract-release") {
        throw new ReleaseValidationError("invalid_contract", "catalogue accepts only admitted releases");
    }
    const verified =
        admission.release.fixtureAssets?.length || admission.release.documentation?.length
            ? await admitContractBundle(
                  admission.release,
                  [...(admission.fixtureAssets ?? []), ...(admission.documentationAssets ?? [])],
                  limits,
              )
            : await admitContractRelease(admission.release, limits);
    if (!admission.release.fixtureAssets?.length && admission.fixtureAssets?.length) {
        throw new ReleaseValidationError("invalid_contract", "unexpected fixture asset bytes");
    }
    if (!admission.release.documentation?.length && admission.documentationAssets?.length) {
        throw new ReleaseValidationError("invalid_contract", "unexpected documentation bytes");
    }
    if (verified.digest !== admission.digest || verified.canonicalJson !== admission.canonicalJson) {
        throw new ReleaseValidationError("invalid_contract", "admitted release artifact failed integrity verification");
    }
    return verified;
}
