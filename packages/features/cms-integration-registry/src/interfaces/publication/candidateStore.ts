import type {
    AdmissionInputSnapshotV1,
    CompatibilityReportV2,
    IntegrationVerificationEnvelopeV1,
    ReleaseAdmissionPolicySnapshotV1,
    StatefulChangeSelectionV1,
    VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type {
    BeginIntegrationRegistryCandidatePublicationInput,
    ClaimIntegrationRegistryCandidateInput,
    CompleteIntegrationRegistryCandidateInput,
    CompleteIntegrationRegistryCandidatePublicationInput,
    CreateIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateRecord,
    PersistIntegrationRegistryCandidatePlanningInput,
    QueueIntegrationRegistryCandidateInput,
    RejectIntegrationRegistryCandidatePublicationInput,
    RejectIntegrationRegistryCandidateValidationInput,
} from "./candidate";

export type IntegrationRegistryCandidateObjects = Readonly<{
    package: IntegrationPackageEnvelopeV1;
    verification: IntegrationVerificationEnvelopeV1;
    policy?: ReleaseAdmissionPolicySnapshotV1;
    admission?: AdmissionInputSnapshotV1;
    compatibilityReport?: CompatibilityReportV2;
    statefulChanges?: StatefulChangeSelectionV1;
    verificationJobResult?: VerificationJobResultV1;
}>;

export interface IntegrationRegistryCandidateStore {
    create(input: CreateIntegrationRegistryCandidateInput): Promise<IntegrationRegistryCandidateRecord>;
    get(candidateId: string): Promise<IntegrationRegistryCandidateRecord | null>;
    objects(candidateId: string): Promise<IntegrationRegistryCandidateObjects>;
    persistPlanningArtifacts(
        candidateId: string,
        input: PersistIntegrationRegistryCandidatePlanningInput,
    ): Promise<Readonly<{ compatibilityReportDigest: string; statefulChangeSelectionDigest: string }>>;
    listClaimable(now: string, limit?: number): Promise<readonly IntegrationRegistryCandidateRecord[]>;
    listPublicationPending(limit?: number): Promise<readonly IntegrationRegistryCandidateRecord[]>;
    advanceValidation(
        candidateId: string,
        input: Readonly<{ expectedRevision: number; now: string }>,
    ): Promise<IntegrationRegistryCandidateRecord>;
    rejectValidation(
        candidateId: string,
        input: RejectIntegrationRegistryCandidateValidationInput,
    ): Promise<IntegrationRegistryCandidateRecord>;
    queue(
        candidateId: string,
        input: QueueIntegrationRegistryCandidateInput,
    ): Promise<IntegrationRegistryCandidateRecord>;
    claim(
        candidateId: string,
        input: ClaimIntegrationRegistryCandidateInput,
    ): Promise<IntegrationRegistryCandidateRecord>;
    renew(
        candidateId: string,
        input: Readonly<{
            expectedRevision: number;
            attemptId: string;
            fencingToken: number;
            now: string;
            leaseExpiresAt: string;
        }>,
    ): Promise<IntegrationRegistryCandidateRecord>;
    complete(
        candidateId: string,
        input: CompleteIntegrationRegistryCandidateInput,
    ): Promise<IntegrationRegistryCandidateRecord>;
    beginPublication(
        candidateId: string,
        input: BeginIntegrationRegistryCandidatePublicationInput,
    ): Promise<IntegrationRegistryCandidateRecord>;
    completePublication(
        candidateId: string,
        input: CompleteIntegrationRegistryCandidatePublicationInput,
    ): Promise<IntegrationRegistryCandidateRecord>;
    rejectPublication(
        candidateId: string,
        input: RejectIntegrationRegistryCandidatePublicationInput,
    ): Promise<IntegrationRegistryCandidateRecord>;
    recoverExpiredLease(
        candidateId: string,
        input: Readonly<{ expectedRevision: number; now: string }>,
    ): Promise<IntegrationRegistryCandidateRecord>;
    recoverExpiredLeases(now: string, limit?: number): Promise<readonly IntegrationRegistryCandidateRecord[]>;
    expireDueCandidates(now: string, limit?: number): Promise<readonly IntegrationRegistryCandidateRecord[]>;
    expire(candidateId: string, expectedRevision: number, now: string): Promise<IntegrationRegistryCandidateRecord>;
}
