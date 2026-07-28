import type {
    AdmissionActiveContractReferenceV1,
    AdmissionInputSnapshotV1,
    AdmissionSuitePlanEntryV1,
    ReleaseAdmissionPolicySnapshotV1,
} from "../../../interfaces/verification";
import { invalidReference, samePinnedRunner } from "../shared";

export function assertContractSuites(
    activeContracts: readonly AdmissionActiveContractReferenceV1[],
    suites: readonly AdmissionSuitePlanEntryV1[],
): void {
    const contractSuites = suites.filter((suite) => suite.source === "author-contract");
    if (contractSuites.length !== activeContracts.length) {
        invalidReference("admission.suites", "must execute every and only active author contract");
    }
    for (const contract of activeContracts) {
        const suite = contractSuites.find((candidate) => candidate.suiteId === contract.contractId);
        if (!suite || suite.contentDigest !== contract.contractDigest) {
            invalidReference("admission.suites", `does not bind active contract ${contract.contractId}`);
        }
    }
}

export function assertPlatformSuites(
    admission: AdmissionInputSnapshotV1,
    policy: ReleaseAdmissionPolicySnapshotV1,
): void {
    const expected = policy.platformRequiredSuites.filter((suite) =>
        samePinnedRunner(suite.runner, admission.selectedRunner),
    );
    const observed = admission.suites.filter((suite) => suite.source === "platform");
    if (expected.length !== observed.length) {
        invalidReference("admission.suites", "must execute every and only platform suites for the selected runner");
    }
    for (const suite of expected) {
        const actual = observed.find((candidate) => candidate.suiteId === suite.suiteId);
        if (!actual || actual.contentDigest !== suite.suiteDigest) {
            invalidReference("admission.suites", `does not bind platform suite ${suite.suiteId}`);
        }
    }
}
