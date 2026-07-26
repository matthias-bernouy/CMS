import type { PinnedVerificationRunnerIdentity } from "../runner";

export const ADMISSION_INPUT_SNAPSHOT_SCHEMA = "cms.integration.admission-input.v1" as const;

export type AdmissionReviewedBaselineReferenceV1 = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    connectorKey: string;
    lineageId: string;
    revisionId: string;
    baselineDigest: string;
    observedSchemaDigest: string;
}>;

export type AdmissionDependencyReferenceV1 = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
}>;

export type AdmissionActiveContractReferenceV1 = Readonly<{
    contractId: string;
    lineageId: string;
    ownerVersion: string;
    contractDigest: string;
}>;

export type AdmissionSuitePlanEntryV1 = Readonly<{
    suiteId: string;
    source: "platform" | "author-contract" | "author-conformance";
    contentDigest: string;
}>;

export type AdmissionInputSnapshotV1 = Readonly<{
    schema: typeof ADMISSION_INPUT_SNAPSHOT_SCHEMA;
    candidate: Readonly<{
        candidateId: string;
        candidateDigest: string;
        kind: string;
        version: string;
        packageDigest: string;
        verificationDigest: string;
    }>;
    policyDigest: string;
    selectedRunner: PinnedVerificationRunnerIdentity;
    reviewedBaselines: readonly AdmissionReviewedBaselineReferenceV1[];
    dependencies: readonly AdmissionDependencyReferenceV1[];
    activeContracts: readonly AdmissionActiveContractReferenceV1[];
    suites: readonly AdmissionSuitePlanEntryV1[];
    catalogRevision: Readonly<{
        revisionId: string;
        digest: string;
    }>;
    compatibilityRevision: Readonly<{
        revisionId: string;
        digest: string;
        evaluatorInputDigest: string;
    }>;
}>;

export type IdentifiedAdmissionInputSnapshotV1 = Readonly<{
    snapshot: AdmissionInputSnapshotV1;
    canonicalBytes: Uint8Array;
    digest: string;
}>;
