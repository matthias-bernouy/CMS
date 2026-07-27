import { computeIntegrationPackageDigest } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    buildIntegrationVerificationSuiteContent,
    identifyIntegrationVerificationSuiteContent,
    identifyReleaseAdmissionPolicySnapshot,
    type AdmissionInputSnapshotV1,
    type IntegrationVerificationEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import type { CandidateStatusProjection, ClaimedVerificationJob, VerificationSandboxInput } from "../../src";
import {
    DIGEST_A,
    DIGEST_B,
    DIGEST_C,
    LEASE_EXPIRY,
    NOW,
    packageEnvelope,
    policyFixture,
    runnerFixture,
} from "./contracts";

export async function workloadFixture(): Promise<ClaimedVerificationJob["workload"]> {
    const packageValue = packageEnvelope();
    const packageDigest = await computeIntegrationPackageDigest(packageValue);
    const verification: IntegrationVerificationEnvelopeV1 = {
        schema: "cms.integration.verification.v1",
        target: { kind: "example", version: "1.2.0", packageDigest },
        manifest: {
            runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
            contracts: [],
            conformance: [{ suiteId: "implementation", entrypoint: "tests/implementation.ts" }],
            fixtures: [],
        },
        files: {
            "tests/implementation.ts": {
                encoding: "utf8",
                content:
                    'import { defineSuite, test } from "@bernouy/cms-integration-verification/sdk/v1"; export default defineSuite({ tests: [test("implementation", () => undefined)] });',
            },
        },
    };
    const verificationDigest = await computeIntegrationVerificationDigest(verification);
    const implementation = await identifyIntegrationVerificationSuiteContent(
        await buildIntegrationVerificationSuiteContent(verification, "conformance", "implementation"),
    );
    const policy = await policyFixture();
    const policyDigest = (await identifyReleaseAdmissionPolicySnapshot(policy)).digest;
    const admission: AdmissionInputSnapshotV1 = {
        schema: "cms.integration.admission-input.v1",
        candidate: {
            candidateId: "candidate-1",
            candidateDigest: DIGEST_B,
            kind: "example",
            version: "1.2.0",
            packageDigest,
            verificationDigest,
        },
        policyDigest,
        selectedRunner: runnerFixture(),
        reviewedBaselines: [],
        dependencies: [],
        activeContracts: [],
        suites: [
            { suiteId: "implementation", source: "author-conformance", contentDigest: implementation.digest },
            { suiteId: "platform-install", source: "platform", contentDigest: DIGEST_C },
        ],
        catalogRevision: { revisionId: "catalog-1", digest: DIGEST_A },
        compatibilityRevision: {
            revisionId: "compatibility-1",
            digest: DIGEST_B,
            evaluatorInputDigest: DIGEST_C,
        },
    };
    return {
        package: packageValue,
        verification,
        policy,
        admission,
        authorSuites: [
            {
                suiteId: "implementation",
                source: "author-conformance",
                contentDigest: implementation.digest,
                content: implementation.content,
            },
        ],
        dependencyPackages: [],
        migrationInputs: [],
        migrationPackages: [],
    };
}

export async function queuedCandidate(): Promise<CandidateStatusProjection> {
    return candidateStatus("queued", 2, await workloadFixture());
}

export async function claimedJob(): Promise<ClaimedVerificationJob> {
    const workload = await workloadFixture();
    return {
        candidate: candidateStatus("running", 3, workload) as ClaimedVerificationJob["candidate"],
        workload,
    };
}

export async function sandboxInputFixture(): Promise<VerificationSandboxInput> {
    const claimed = await claimedJob();
    return {
        workload: {
            ...claimed.workload,
            attempt: {
                jobId: claimed.candidate.lease.jobId,
                attemptId: claimed.candidate.lease.attemptId,
                fencingToken: claimed.candidate.lease.fencingToken,
            },
        },
        database: {
            databaseId: "database-1",
            connectionUri: "postgresql://ephemeral:database-secret@postgres:5432/cmscore_contracts_1",
        },
    };
}

function candidateStatus(
    status: "queued" | "running",
    revision: number,
    workload: ClaimedVerificationJob["workload"],
): CandidateStatusProjection {
    const common = {
        candidateId: "candidate-1",
        revision,
        status,
        kind: "example",
        version: "1.2.0",
        candidateDigest: DIGEST_B,
        packageDigest: workload.admission.candidate.packageDigest,
        verificationDigest: workload.admission.candidate.verificationDigest,
        createdAt: NOW,
        updatedAt: NOW,
        expiresAt: "2026-07-26T14:00:00.000Z",
        attemptCount: status === "running" ? 1 : 0,
    } as const;
    return status === "running"
        ? {
              ...common,
              lease: {
                  jobId: "job-1",
                  attemptId: "attempt-1",
                  fencingToken: 1,
                  workerId: "worker-1",
                  claimedAt: NOW,
                  leaseExpiresAt: LEASE_EXPIRY,
              },
          }
        : common;
}
