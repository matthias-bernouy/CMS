import type {
    CandidateAdmissionJobResultV1,
    MigrationJobResultV1,
} from "../../../../src/interfaces/verification/migration";
import { DIGEST_A, DIGEST_B, DIGEST_C } from "../../fixtures";
import { DIGEST_D, DIGEST_E, DIGEST_F } from "../controlFixtures";
import { ATTEMPT, CHECKSUM_ONE, CHECKSUM_TWO, SOURCE, TARGET, type MigrationControlFixture } from "./fixtures";

export function migrationJobResult(fixture: MigrationControlFixture): MigrationJobResultV1 {
    return {
        schema: "cms.integration.migration-job-result.v1",
        ...ATTEMPT,
        migrationInputDigest: fixture.inputDigest,
        runnerDigest: fixture.input.runner.digest,
        environmentDigest: fixture.input.environment.digest,
        observations: {
            freshTarget: targetObservation(),
            migratedTarget: targetObservation(),
            equivalence: {
                ...passedEvidence(DIGEST_C),
                freshStateDigest: DIGEST_A,
                migratedStateDigest: DIGEST_A,
                equivalent: true,
                differences: [],
            },
            ledger: {
                ...passedEvidence(DIGEST_D),
                sourceRevision: 1,
                targetRevision: 2,
                freshBaselineRecorded: true,
                migrationAndLedgerAtomic: true,
                checksumMismatchRejected: true,
                emptyLedgerRejected: true,
                rows: [
                    {
                        migrationId: "001-initial",
                        checksum: CHECKSUM_ONE,
                        revision: 1,
                        attemptId: "source-install-attempt",
                    },
                    {
                        migrationId: "002-contract",
                        checksum: CHECKSUM_TWO,
                        revision: 2,
                        attemptId: ATTEMPT.attemptId,
                        sourcePackageDigest: SOURCE.packageDigest,
                        targetPackageDigest: TARGET.packageDigest,
                    },
                ],
            },
            replay: {
                ...passedEvidence(DIGEST_E),
                firstStateDigest: DIGEST_A,
                replayStateDigest: DIGEST_A,
                unchanged: true,
                ledgerRowsBefore: 1,
                ledgerRowsAfterFirstRun: 2,
                ledgerRowsAfterReplay: 2,
            },
            failureInjections: [
                {
                    ...passedEvidence(DIGEST_E),
                    boundary: "after-expand",
                    injected: true,
                    recovery: "safe-resume",
                    recoveredStateDigest: DIGEST_A,
                },
            ],
            resumptions: [
                {
                    ...passedEvidence(DIGEST_F),
                    boundary: "after-expand",
                    attempts: 2,
                    staleFenceRejected: true,
                    resumedStateDigest: DIGEST_A,
                    expectedStateDigest: DIGEST_A,
                    matched: true,
                },
            ],
            cutover: {
                cmsMediated: {
                    ...passedEvidence(DIGEST_A),
                    strategy: "binding-switch",
                    bindingRevisionBefore: DIGEST_B,
                    bindingRevisionAfter: DIGEST_C,
                },
                providerDirect: {
                    ...passedEvidence(DIGEST_B),
                    strategy: "expand-in-code",
                    callbackIds: ["stripe-webhook"],
                    signingSecretContinuityObserved: true,
                    providerStateDigest: DIGEST_D,
                },
                activation: {
                    ...passedEvidence(DIGEST_C),
                    activePackageDigest: TARGET.packageDigest,
                    activeBindingDigest: DIGEST_C,
                    pointOfNoReturnCrossed: true,
                    cleanupObserved: true,
                },
            },
        },
    };
}

export function candidateJobResult(fixture: MigrationControlFixture): CandidateAdmissionJobResultV1 {
    return {
        schema: "cms.integration.candidate-admission-job-result.v1",
        verification: fixture.verification,
        migrations: [migrationJobResult(fixture)],
    };
}

export function unsupportedEvidence() {
    return { status: "not-supported", evidenceDigests: [], diagnosticCodes: [] } as const;
}

function targetObservation(): MigrationJobResultV1["observations"]["freshTarget"] {
    return {
        ...passedEvidence(DIGEST_A),
        stateDigest: DIGEST_A,
        schemaDigest: DIGEST_B,
        dataDigest: DIGEST_C,
        functionDigests: [{ functionId: "api", digest: DIGEST_D }],
        bindingDigest: DIGEST_C,
    };
}

function passedEvidence(digest: string) {
    return { status: "passed", evidenceDigests: [digest], diagnosticCodes: [] } as const;
}
