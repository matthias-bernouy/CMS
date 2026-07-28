import { canonicalJsonBytes, sha256Hex, type ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import {
    identifyMigrationVerificationEnvironment,
    validateIntegrationCandidateEnvelope,
    type IntegrationVerificationEnvelopeV1,
    type MigrationVerificationEnvironmentV1,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import { FsIntegrationRegistryCandidateStore } from "@bernouy/cms-integration-registry/fs";
import { candidatePolicy } from "../filesystem/fixtures/admission";

export async function verificationCandidate(
    integrationPackage: ResolvedIntegrationPackage,
    manifest: Partial<IntegrationVerificationEnvelopeV1["manifest"]> = {},
) {
    const files = {
        "tests/contract.ts": { encoding: "utf8" as const, content: "export default true;" },
        "tests/conformance.ts": { encoding: "utf8" as const, content: "export default true;" },
        "fixtures/input.json": { encoding: "utf8" as const, content: "{}" },
    };
    return await validateIntegrationCandidateEnvelope({
        schema: "cms.integration.candidate.v1",
        package: integrationPackage.envelope,
        verification: {
            schema: "cms.integration.verification.v1",
            target: {
                kind: integrationPackage.envelope.kind,
                version: integrationPackage.envelope.version,
                packageDigest: integrationPackage.digest,
            },
            manifest: {
                runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
                contracts: [],
                conformance: [],
                fixtures: [],
                ...manifest,
            },
            files,
        },
        submission: { requestedChannel: "latest" },
    });
}

export async function validatingCandidate(
    root: string,
    candidateId: string,
    candidate: Awaited<ReturnType<typeof verificationCandidate>>,
) {
    const store = new FsIntegrationRegistryCandidateStore({ root });
    const uploaded = await store.create({
        candidateId,
        candidate,
        createdAt: "2026-07-26T10:00:00.000Z",
        expiresAt: "2026-07-27T10:00:00.000Z",
    });
    await store.advanceValidation(candidateId, {
        expectedRevision: uploaded.revision,
        now: "2026-07-26T10:00:01.000Z",
    });
    return store;
}

export async function planningPolicy(): Promise<ReleaseAdmissionPolicySnapshotV1> {
    return await candidatePolicy();
}

export async function planningMigrationEnvironment(
    policy: ReleaseAdmissionPolicySnapshotV1,
): Promise<MigrationVerificationEnvironmentV1> {
    const runner = policy.approvedRunners[0]!;
    return (
        await identifyMigrationVerificationEnvironment({
            schema: "cms.integration.migration-verification-environment.v1",
            postgres: { version: "16.4", imageDigest: `sha256:${"8".repeat(64)}` },
            runner: { digest: await sha256Hex(canonicalJsonBytes(runner)), identity: runner },
            bootstrapSqlDigest: "7".repeat(64),
            roles: [],
            grants: [],
            extensions: [],
            fixtures: [],
            sessionSettings: [],
            policy: policy.migrationPolicy,
        })
    ).environment;
}

export async function planningMigrationConfiguration(policy: ReleaseAdmissionPolicySnapshotV1) {
    const environment = await planningMigrationEnvironment(policy);
    const environmentDigest = (await identifyMigrationVerificationEnvironment(environment)).digest;
    return {
        environment,
        policy: {
            ...policy,
            migrationEvidence: {
                ...policy.migrationEvidence,
                approvedEnvironmentDigests: [environmentDigest],
            },
        } satisfies ReleaseAdmissionPolicySnapshotV1,
    };
}
