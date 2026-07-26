import type {
    PinnedVerificationRunnerIdentity,
    VerificationJobAttemptIdentityV1,
    VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import type { CandidateStatusProjection, CandidateWorkerClient, ExactVerificationWorkload } from "../protocol";

export type DisposableVerificationDatabaseCredential = Readonly<{
    databaseId: string;
    connectionUri: string;
}>;

export type VerificationSandboxWorkload = ExactVerificationWorkload &
    Readonly<{
        attempt: VerificationJobAttemptIdentityV1;
    }>;

export type VerificationSandboxInput = Readonly<{
    workload: VerificationSandboxWorkload;
    database: DisposableVerificationDatabaseCredential;
}>;

export interface VerificationSandbox {
    readonly identity: PinnedVerificationRunnerIdentity;
    run(input: VerificationSandboxInput, signal: AbortSignal): Promise<VerificationJobResultV1>;
}

export interface DisposableVerificationDatabaseLease {
    readonly credential: DisposableVerificationDatabaseCredential;
    release(): Promise<void>;
}

export interface DisposableVerificationDatabaseProvider {
    acquire(
        identity: Readonly<{
            candidateId: string;
            packageDigest: string;
            verificationDigest: string;
        }>,
        signal: AbortSignal,
    ): Promise<DisposableVerificationDatabaseLease>;
}

export interface VerificationRenewalScheduler {
    now(): number;
    sleep(durationMs: number, signal: AbortSignal): Promise<void>;
}

export type VerificationSupervisorRunResult =
    | Readonly<{ outcome: "idle" }>
    | Readonly<{
          outcome: "submitted";
          candidateId: string;
          resultDigest: string;
          status: CandidateStatusProjection["status"];
      }>;

export type VerificationSupervisorConfig = Readonly<{
    client: CandidateWorkerClient;
    sandbox: VerificationSandbox;
    databases: DisposableVerificationDatabaseProvider;
    scheduler?: VerificationRenewalScheduler;
    jobListLimit: number;
    leaseRenewalIntervalMs: number;
}>;

export interface VerificationSupervisor {
    runNext(signal?: AbortSignal): Promise<VerificationSupervisorRunResult>;
}
