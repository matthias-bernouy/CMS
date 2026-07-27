import type { ReleaseAdmissionPolicySnapshotV1 } from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCandidateStore } from "cms-integration-registry/interfaces/publication";
import type {
    IntegrationCompatibilityV2ReportStore,
    IntegrationMigrationReportStore,
    IntegrationVerificationBundleStore,
    IntegrationVerificationReportStore,
    ReleaseAdmissionDecisionStore,
    ReviewedSchemaBaselineStore,
} from "cms-integration-registry/interfaces/reportStore";
import type { FsIntegrationRegistryPublicationConfig } from "../../types";
import type { IntegrationVerificationContractLineageStore } from "../contracts";

export type FsIntegrationRegistryCandidateFinalizerConfig = FsIntegrationRegistryPublicationConfig &
    Readonly<{
        candidates: IntegrationRegistryCandidateStore;
        policy: ReleaseAdmissionPolicySnapshotV1;
        reviewedSchemaBaselines: ReviewedSchemaBaselineStore;
        compatibilityReports: IntegrationCompatibilityV2ReportStore;
        verificationReports: IntegrationVerificationReportStore;
        migrationReports: IntegrationMigrationReportStore;
        releaseDecisions: ReleaseAdmissionDecisionStore;
        verificationBundles: IntegrationVerificationBundleStore;
        inheritedContracts?: IntegrationVerificationContractLineageStore;
        createDecisionId?: (candidateId: string) => string;
        afterActivationPhase?: (
            phase: "prepared" | "index-written" | "snapshot-swapped" | "candidate-published",
        ) => void | Promise<void>;
    }>;

type FinalizedCandidateIdentity = Readonly<{
    candidateId: string;
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
}>;

export type FinalizedIntegrationRegistryCandidate = FinalizedCandidateIdentity &
    (
        | Readonly<{
              decisionRevisionId: string;
              decisionDigest: string;
              status: "published";
          }>
        | Readonly<{ status: "rejected" }>
    );

export class FsIntegrationRegistryCandidateFinalizationError extends Error {
    override readonly name = "FsIntegrationRegistryCandidateFinalizationError";

    constructor(
        readonly code:
            | "candidate_not_ready"
            | "admission_stale"
            | "admission_rejected"
            | "publication_recovery_required",
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }
}
