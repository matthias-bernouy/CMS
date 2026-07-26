import type {
    AdmissionInputSnapshotV1,
    IntegrationVerificationEnvelopeV1,
    ReleaseAdmissionPolicySnapshotV1,
    VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type {
    ClaimIntegrationRegistryCandidateInput,
    CompleteIntegrationRegistryCandidateInput,
    CreateIntegrationRegistryCandidateInput,
    IntegrationRegistryCandidateRecord,
    QueueIntegrationRegistryCandidateInput,
    RejectIntegrationRegistryCandidateValidationInput,
} from "./candidate";

export type IntegrationRegistryCandidateObjects = Readonly<{
    package: IntegrationPackageEnvelopeV1;
    verification: IntegrationVerificationEnvelopeV1;
    policy?: ReleaseAdmissionPolicySnapshotV1;
    admission?: AdmissionInputSnapshotV1;
    verificationJobResult?: VerificationJobResultV1;
}>;

export interface IntegrationRegistryCandidateStore {
    create(input: CreateIntegrationRegistryCandidateInput): Promise<IntegrationRegistryCandidateRecord>;
    get(candidateId: string): Promise<IntegrationRegistryCandidateRecord | null>;
    objects(candidateId: string): Promise<IntegrationRegistryCandidateObjects>;
    listClaimable(now: string, limit?: number): Promise<readonly IntegrationRegistryCandidateRecord[]>;
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
    recoverExpiredLease(
        candidateId: string,
        input: Readonly<{ expectedRevision: number; now: string }>,
    ): Promise<IntegrationRegistryCandidateRecord>;
    recoverExpiredLeases(now: string, limit?: number): Promise<readonly IntegrationRegistryCandidateRecord[]>;
    expireDueCandidates(now: string, limit?: number): Promise<readonly IntegrationRegistryCandidateRecord[]>;
    expire(candidateId: string, expectedRevision: number, now: string): Promise<IntegrationRegistryCandidateRecord>;
}
