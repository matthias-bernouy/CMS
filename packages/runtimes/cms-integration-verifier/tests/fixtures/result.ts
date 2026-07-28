import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    type CandidateAdmissionJobResultV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import type { ClaimedVerificationJob, VerificationSandboxInput } from "../../src";
import { runnerFixture } from "./contracts";

export async function validJobResult(job: ClaimedVerificationJob): Promise<CandidateAdmissionJobResultV1> {
    return await validSandboxResult({
        workload: {
            ...job.workload,
            attempt: {
                jobId: job.candidate.lease.jobId,
                attemptId: job.candidate.lease.attemptId,
                fencingToken: job.candidate.lease.fencingToken,
            },
        },
        database: { databaseId: "unused", connectionUri: "postgresql://unused:unused@localhost:5432/unused" },
    });
}

export async function validSandboxResult(input: VerificationSandboxInput): Promise<CandidateAdmissionJobResultV1> {
    return {
        schema: "cms.integration.candidate-admission-job-result.v1",
        verification: await validVerificationResult(input),
        migrations: [],
    };
}

async function validVerificationResult(input: VerificationSandboxInput): Promise<VerificationJobResultV1> {
    const { admission, attempt } = input.workload;
    const admissionDigest = (await identifyAdmissionInputSnapshot(admission)).digest;
    const versions = [{ name: "postgres", version: "16.4" }];
    return {
        schema: "cms.integration.verification-job-result.v1",
        candidateId: admission.candidate.candidateId,
        ...attempt,
        bindings: {
            admissionDigest,
            candidateDigest: admission.candidate.candidateDigest,
            packageDigest: admission.candidate.packageDigest,
            verificationDigest: admission.candidate.verificationDigest,
            policyDigest: admission.policyDigest,
            reviewedBaselineRevisionIds: [],
            reviewedBaselineDigests: [],
            reviewedObservedSchemaDigests: [],
            dependencyDigests: [],
            activeContractDigests: [],
            suiteContentDigests: admission.suites.map((suite) => suite.contentDigest).toSorted(),
            catalogRevisionDigest: admission.catalogRevision.digest,
            compatibilityRevisionDigest: admission.compatibilityRevision.digest,
            compatibilityEvaluatorInputDigest: admission.compatibilityRevision.evaluatorInputDigest,
            ...(admission.behavioralRlsPlan ? { behavioralRlsPlanDigest: admission.behavioralRlsPlan.digest } : {}),
        },
        runner: runnerFixture(),
        environment: { digest: await sha256Hex(canonicalJsonBytes(versions)), versions },
        results: admission.suites.map((suite) => ({
            suiteId: suite.suiteId,
            outcome: "passed",
            durationMs: 10,
            attempts: 1,
            cacheHit: false,
            evidenceDigests: [suite.contentDigest],
            diagnostics: [],
        })),
    };
}
