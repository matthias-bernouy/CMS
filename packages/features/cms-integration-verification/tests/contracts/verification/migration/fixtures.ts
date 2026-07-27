import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { DeclarativeConnectorMigrationPlan } from "@bernouy/cms-integrations";
import { identifyStatefulChangeSelection } from "../../../../src/core/reports/decision/selection";
import { identifyMigrationVerificationEnvironment } from "../../../../src/core/verification/migration/environment";
import { identifyMigrationVerificationInput } from "../../../../src/core/verification/migration/input";
import { identifyMigrationVerificationPlan } from "../../../../src/core/verification/migration/plan";
import type { MigrationVerificationInputV1 } from "../../../../src/interfaces/verification/migration";
import {
    identifyAdmissionInputSnapshot,
    identifyReleaseAdmissionPolicySnapshot,
    type AdmissionInputSnapshotV1,
    type ReleaseAdmissionPolicySnapshotV1,
    type VerificationJobResultV1,
} from "../../../../src/exports/index";
import { DIGEST_A, DIGEST_B, DIGEST_C } from "../../fixtures";
import {
    ATTEMPT,
    DIGEST_D,
    DIGEST_E,
    DIGEST_F,
    DIGEST_ZERO,
    admissionSnapshot,
    jobResult,
    policySnapshot,
} from "../controlFixtures";
import { environmentManifest } from "./environmentFixtures";

export const SOURCE = { kind: "example", version: "1.1.0", packageDigest: DIGEST_C } as const;
export const TARGET = { kind: "example", version: "1.2.0", packageDigest: DIGEST_B } as const;
export const CHECKSUM_ONE = `sha256:${DIGEST_D}` as const;
export const CHECKSUM_TWO = `sha256:${DIGEST_E}` as const;

export type MigrationControlFixture = Readonly<{
    policy: ReleaseAdmissionPolicySnapshotV1;
    admission: AdmissionInputSnapshotV1;
    verification: VerificationJobResultV1;
    environment: MigrationVerificationInputV1["environment"]["manifest"];
    input: MigrationVerificationInputV1;
    inputDigest: string;
}>;

export async function migrationControlFixture(): Promise<MigrationControlFixture> {
    const basePolicy = await policySnapshot();
    const runner = basePolicy.approvedRunners.find((entry) => entry.name === "cms-postgres")!;
    const runnerDigest = await sha256Hex(canonicalJsonBytes(runner));
    const environment = await identifyMigrationVerificationEnvironment(
        environmentManifest(basePolicy, runnerDigest, runner),
    );
    const policy = (
        await identifyReleaseAdmissionPolicySnapshot({
            ...basePolicy,
            migrationEvidence: {
                ...basePolicy.migrationEvidence,
                approvedEnvironmentDigests: [environment.digest],
            },
        })
    ).snapshot;
    const policyDigest = (await identifyReleaseAdmissionPolicySnapshot(policy)).digest;
    const selection = await identifyStatefulChangeSelection({
        schema: "cms.integration.stateful-change-selection.v1",
        selector: policy.migrationPolicy,
        policySnapshotDigest: policyDigest,
        target: TARGET,
        compatibilityReport: { revisionId: "compatibility-4", reportDigest: DIGEST_C },
        requiredMigrations: [{ source: SOURCE, connectorKey: "primary", lineageId: "example-supabase-v1" }],
    });
    const plan = await identifyMigrationVerificationPlan(migrationPlan(), TARGET.version, 2);
    const identifiedInput = await identifyMigrationVerificationInput({
        schema: "cms.integration.migration-verification-input.v1",
        source: SOURCE,
        target: TARGET,
        dependencyMatrices: dependencyMatrices(),
        connectorKey: "primary",
        lineageId: "example-supabase-v1",
        sourceMigrationRevision: 1,
        targetMigrationRevision: 2,
        statefulChanges: { digest: selection.digest, selection: selection.selection },
        migrationPlan: { digest: plan.digest, plan: plan.plan },
        policy: { digest: policyDigest, snapshot: policy },
        runner: { digest: runnerDigest, identity: runner },
        environment: { digest: environment.digest, manifest: environment.environment },
    });
    const baseAdmission = await admissionSnapshot(policy);
    const admission = (
        await identifyAdmissionInputSnapshot({
            ...baseAdmission,
            dependencies: identifiedInput.input.dependencyMatrices.flatMap((matrix) =>
                matrix.dependencies.map((entry) => ({ ...entry, selection: matrix.selection })),
            ),
        })
    ).snapshot;
    return {
        policy,
        admission,
        verification: await jobResult(policy, admission),
        environment: environment.environment,
        input: identifiedInput.input,
        inputDigest: identifiedInput.digest,
    };
}

export function dependencyMatrices(): MigrationVerificationInputV1["dependencyMatrices"] {
    return [
        {
            selection: "minimum",
            dependencies: [
                { kind: "dependency-b", version: "1.0.0", packageDigest: DIGEST_D },
                { kind: "dependency-a", version: "1.0.0", packageDigest: DIGEST_E },
            ],
        },
        {
            selection: "stable",
            dependencies: [
                { kind: "dependency-b", version: "1.2.0", packageDigest: DIGEST_F },
                { kind: "dependency-a", version: "2.0.0", packageDigest: DIGEST_ZERO },
            ],
        },
    ];
}

export function migrationPlan(): DeclarativeConnectorMigrationPlan {
    return {
        install: {
            revision: 2,
            digest: `sha256:${DIGEST_F}`,
            coveredMigrations: [
                { id: "001-initial", checksum: CHECKSUM_ONE, revision: 1, introducedIn: "1.1.0" },
                { id: "002-contract", checksum: CHECKSUM_TWO, revision: 2, introducedIn: "1.2.0" },
            ],
        },
        migrations: [
            {
                id: "001-initial",
                checksum: CHECKSUM_ONE,
                fromRevision: 0,
                toRevision: 1,
                introducedIn: "1.1.0",
                transaction: "atomic",
                phase: "expand",
                path: "migrations/001-initial.sql",
            },
            {
                id: "002-contract",
                checksum: CHECKSUM_TWO,
                fromRevision: 1,
                toRevision: 2,
                introducedIn: "1.2.0",
                transaction: "atomic",
                phase: "contract",
                path: "migrations/002-contract.sql",
            },
        ],
        repeatables: [{ id: "views", checksum: `sha256:${DIGEST_A}`, path: "repeatables/views.sql" }],
        supportedSources: [{ range: "1.1.0", migrationRevision: 1 }],
        equivalence: {
            dataProjections: [
                {
                    kind: "database-clock-default",
                    namespace: "example",
                    relation: "settings",
                    columns: ["created_at", "updated_at"],
                },
            ],
        },
        cmsMediated: {
            strategy: "binding-switch",
            smoke: { endpointId: "health", expectedStatus: 200, expectedBody: { ok: true } },
            drainSeconds: 30,
        },
        providerDirect: { strategy: "expand-in-code", callbackIds: ["stripe-webhook"] },
        pointOfNoReturn: "before-contract",
    };
}

export { ATTEMPT };
