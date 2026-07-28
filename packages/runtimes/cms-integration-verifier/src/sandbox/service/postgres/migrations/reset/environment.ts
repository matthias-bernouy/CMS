import { SQL } from "bun";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1,
    identifyMigrationVerificationEnvironment,
    type MigrationVerificationInputV1,
} from "@bernouy/cms-integration-verification";
import {
    environmentMismatch as mismatch,
    observeBootstrap,
    observeExtensions,
    observeGrants,
    observePostgres,
    observeRoles,
    observeSessionSettings,
} from "./observations";

const CONTRACT = CMS_POSTGRES_MIGRATION_ENVIRONMENT_V1;

export async function attestMigrationEnvironment(
    database: SQL,
    declared: MigrationVerificationInputV1["environment"],
): Promise<string> {
    const bootstrapSqlDigest = await sha256Hex(canonicalJsonBytes(CONTRACT.bootstrap));
    const postgres = await observePostgres(database);
    const bootstrap = await observeBootstrap(database);
    const roles = await observeRoles(database);
    const extensions = await observeExtensions(database);
    const grants = await observeGrants(database);
    const sessionSettings = await observeSessionSettings(database);
    requireCanonicalMatch(postgres, CONTRACT.postgres);
    requireCanonicalMatch(bootstrap, CONTRACT.bootstrap);
    requireCanonicalMatch(roles, CONTRACT.roles);
    requireCanonicalMatch(extensions, CONTRACT.extensions);
    requireCanonicalMatch(grants, CONTRACT.grants);
    requireCanonicalMatch(sessionSettings, CONTRACT.sessionSettings);
    requireCanonicalMatch(declared.manifest.postgres, CONTRACT.postgres);
    requireCanonicalMatch(declared.manifest.roles, CONTRACT.roles);
    requireCanonicalMatch(declared.manifest.extensions, CONTRACT.extensions);
    requireCanonicalMatch(declared.manifest.sessionSettings, CONTRACT.sessionSettings);
    requireCanonicalMatch(declared.manifest.grants, CONTRACT.grants);
    requireCanonicalMatch(declared.manifest.fixtures, []);
    if (declared.manifest.bootstrapSqlDigest !== bootstrapSqlDigest) {
        mismatch();
    }
    const observed = await identifyMigrationVerificationEnvironment({
        ...declared.manifest,
        postgres,
        bootstrapSqlDigest,
        roles,
        grants,
        extensions,
        fixtures: [],
        sessionSettings,
    });
    if (observed.digest !== declared.digest) {
        mismatch();
    }
    return observed.digest;
}

function requireCanonicalMatch(left: unknown, right: unknown): void {
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    if (leftBytes.length !== rightBytes.length || leftBytes.some((byte, index) => byte !== rightBytes[index])) {
        mismatch();
    }
}
