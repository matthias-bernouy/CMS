import type {
    AdmissionActiveContractReferenceV1,
    AdmissionInputSnapshotV1,
    AdmissionSuitePlanEntryV1,
    ReleaseAdmissionPolicySnapshotV1,
    StatefulChangeSelectionV1,
    ValidatedIntegrationCandidateEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryCatalogSnapshotProvider } from "cms-integration-registry/interfaces/catalog";
import type { IntegrationRegistryMutationCoordinator } from "cms-integration-registry/interfaces/mutations";
import type { ReviewedSchemaBaselineStore } from "cms-integration-registry/interfaces/reportStore";
import type { FsIntegrationRegistryCandidateStore } from "../../../candidates";

export type InheritedVerificationContract = Readonly<{
    reference: AdmissionActiveContractReferenceV1;
    suite: AdmissionSuitePlanEntryV1 & Readonly<{ source: "author-contract" }>;
}>;

export interface IntegrationVerificationContractCatalog {
    listActive(kind: string, targetVersion: string): Promise<readonly InheritedVerificationContract[]>;
}

export type FsIntegrationRegistryCandidateAdmissionPlannerConfig = Readonly<{
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    mutations: IntegrationRegistryMutationCoordinator;
    candidates: FsIntegrationRegistryCandidateStore;
    reviewedSchemaBaselines: ReviewedSchemaBaselineStore;
    policy: ReleaseAdmissionPolicySnapshotV1;
    inheritedContracts?: IntegrationVerificationContractCatalog;
    limits?: Partial<IntegrationPackageLimits>;
}>;

export type FsIntegrationRegistryCandidateAdmissionPlan = Readonly<{
    policy: ReleaseAdmissionPolicySnapshotV1;
    admission: AdmissionInputSnapshotV1;
    compatibilityReportDigest: string;
    statefulChangeSelectionDigest: string;
    statefulChanges: StatefulChangeSelectionV1;
}>;

export type PlanFsIntegrationRegistryCandidateInput = Readonly<{
    candidateId: string;
    candidate: ValidatedIntegrationCandidateEnvelopeV1;
}>;

export type CandidateAdmissionPlanningErrorCode =
    | "candidate_not_validating"
    | "catalog_changed"
    | "dependency_cycle"
    | "dependency_unavailable"
    | "missing_migration_baseline"
    | "runner_unavailable"
    | "suite_conflict";

export class FsIntegrationRegistryCandidateAdmissionPlanningError extends Error {
    override readonly name = "FsIntegrationRegistryCandidateAdmissionPlanningError";

    constructor(
        readonly code: CandidateAdmissionPlanningErrorCode,
        message: string,
    ) {
        super(message);
    }
}
