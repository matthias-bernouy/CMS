import type { DeclarativeConnectorMigrationPlan } from "@bernouy/cms-integrations";
import type { StatefulChangeSelectionV1 } from "../../reports/decision";
import type { VersionDigestReference } from "../../reports/common";
import type { PinnedVerificationRunnerIdentity } from "../../runner";
import type { ReleaseAdmissionPolicySnapshotV1 } from "../policy";
import type { MigrationVerificationEnvironmentV1 } from "./environment";

export const MIGRATION_VERIFICATION_INPUT_SCHEMA = "cms.integration.migration-verification-input.v1" as const;

export type MigrationVerificationInputV1 = Readonly<{
    schema: typeof MIGRATION_VERIFICATION_INPUT_SCHEMA;
    source: VersionDigestReference;
    target: VersionDigestReference;
    dependencyMatrices: readonly [
        Readonly<{ selection: "minimum"; dependencies: readonly VersionDigestReference[] }>,
        Readonly<{ selection: "stable"; dependencies: readonly VersionDigestReference[] }>,
    ];
    connectorKey: string;
    lineageId: string;
    sourceMigrationRevision: number;
    targetMigrationRevision: number;
    statefulChanges: Readonly<{
        digest: string;
        selection: StatefulChangeSelectionV1;
    }>;
    migrationPlan: Readonly<{
        digest: string;
        plan: DeclarativeConnectorMigrationPlan;
    }>;
    policy: Readonly<{
        digest: string;
        snapshot: ReleaseAdmissionPolicySnapshotV1;
    }>;
    runner: Readonly<{
        digest: string;
        identity: PinnedVerificationRunnerIdentity;
    }>;
    environment: Readonly<{
        digest: string;
        manifest: MigrationVerificationEnvironmentV1;
    }>;
}>;

export type IdentifiedMigrationVerificationInputV1 = Readonly<{
    input: MigrationVerificationInputV1;
    canonicalBytes: Uint8Array;
    digest: string;
}>;
