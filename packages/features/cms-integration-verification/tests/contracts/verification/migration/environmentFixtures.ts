import type { MigrationVerificationEnvironmentV1 } from "../../../../src/interfaces/verification/migration";
import type { ReleaseAdmissionPolicySnapshotV1 } from "../../../../src/exports/index";
import { DIGEST_D, DIGEST_E, DIGEST_F } from "../controlFixtures";

export function environmentManifest(
    policy: ReleaseAdmissionPolicySnapshotV1,
    runnerDigest: string,
    runner: ReleaseAdmissionPolicySnapshotV1["approvedRunners"][number],
): MigrationVerificationEnvironmentV1 {
    return {
        schema: "cms.integration.migration-verification-environment.v1",
        postgres: { version: "17.5", imageDigest: `sha256:${DIGEST_D}` },
        runner: { digest: runnerDigest, identity: runner },
        bootstrapSqlDigest: DIGEST_E,
        roles: [
            { name: "anon", attributes: ["no-bypassrls", "no-login"] },
            { name: "authenticated", attributes: ["login", "no-bypassrls"] },
        ],
        grants: [
            { grantee: "anon", objectType: "schema", object: "public", privileges: ["USAGE"] },
            {
                grantee: "authenticated",
                objectType: "schema",
                object: "public",
                privileges: ["USAGE"],
            },
        ],
        extensions: [{ name: "pgcrypto", version: "1.3" }],
        fixtures: [{ fixtureId: "baseline", digest: DIGEST_F }],
        sessionSettings: [
            { name: "search_path", value: "public,extensions" },
            { name: "statement_timeout", value: "30s" },
        ],
        policy: policy.migrationPolicy,
    };
}
