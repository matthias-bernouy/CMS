import type { IntegrationConnectorMigrationDeployment } from "../../../../interfaces/IntegrationConnectorDeployer";
import { literal } from "../sqlFormat";
import { assertMigrationLedgerProvenance, type SupabaseMigrationLedgerProvenance } from "./fence";
import { RUNTIME_SCHEMA } from "./schema";

export function assertLedgerEntryCompatible(
    integrationKind: string,
    identity: MigrationLedgerIdentity,
    migration: { id: string; checksum: string },
): string {
    return assertionBlock(
        `EXISTS (SELECT 1 FROM ${RUNTIME_SCHEMA}.migration_ledger
          WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
            AND integration_kind = ${literal(integrationKind)}
            AND connector_key = ${literal(identity.connectorKey)}
            AND lineage_id = ${literal(identity.lineageId)}
            AND migration_id = ${literal(migration.id)}
            AND checksum <> ${literal(migration.checksum)})`,
        "cms integration migration checksum conflict",
    );
}

export function assertAdoptedLedgerEntryCompatible(
    integrationKind: string,
    provider: string,
    identity: MigrationLedgerIdentity,
    migration: { id: string; checksum: string; revision: number; introducedIn: string },
    sourcePackageDigest: string,
): string {
    assertSourcePackageDigest(sourcePackageDigest);
    return assertionBlock(
        `EXISTS (SELECT 1 FROM ${RUNTIME_SCHEMA}.migration_ledger
          WHERE connector_instance_id = ${literal(identity.connectorInstanceId)}
            AND integration_kind = ${literal(integrationKind)}
            AND connector_key = ${literal(identity.connectorKey)}
            AND lineage_id = ${literal(identity.lineageId)}
            AND migration_id = ${literal(migration.id)}
            AND (btrim(attempt_id) = '' OR ROW(provider, checksum, migration_revision, introduced_in, source_package_digest,
                    target_package_digest, operation_id, fencing_token)
                IS DISTINCT FROM ROW(${literal(provider)}, ${literal(migration.checksum)}, ${migration.revision},
                                     ${literal(migration.introducedIn)}, ${literal(sourcePackageDigest)},
                                     NULL::text, NULL::text, NULL::bigint)))`,
        "cms integration legacy adoption ledger conflict",
    );
}

export function insertLedger(
    integrationKind: string,
    provider: string,
    identity: MigrationLedgerIdentity,
    migration: { id: string; checksum: string; revision: number; introducedIn: string },
    attemptId: string,
    provenance?: SupabaseMigrationLedgerProvenance,
): string {
    if (provenance) {
        assertMigrationLedgerProvenance(provenance);
        if (provenance.attemptId !== attemptId) {
            throw new Error("Supabase migration provenance attemptId must match the ledger attemptId");
        }
    }
    const provenanceColumns = provenance
        ? ", source_package_digest, target_package_digest, operation_id, fencing_token"
        : "";
    const sourcePackageDigest = provenance?.sourcePackageDigest ? literal(provenance.sourcePackageDigest) : "NULL";
    const targetPackageDigest = provenance?.targetPackageDigest ? literal(provenance.targetPackageDigest) : "NULL";
    const operationId = provenance?.operationId ? literal(provenance.operationId) : "NULL";
    const fencingToken = provenance?.fencingToken === undefined ? "NULL" : String(provenance.fencingToken);
    const provenanceValues = provenance
        ? `, ${sourcePackageDigest}, ${targetPackageDigest}, ${operationId}, ${fencingToken}`
        : "";
    return `INSERT INTO ${RUNTIME_SCHEMA}.migration_ledger
    (connector_instance_id, integration_kind, connector_key, lineage_id, migration_id, provider,
     checksum, migration_revision, introduced_in, attempt_id${provenanceColumns})
VALUES (${literal(identity.connectorInstanceId)}, ${literal(integrationKind)}, ${literal(identity.connectorKey)},
        ${literal(identity.lineageId)}, ${literal(migration.id)}, ${literal(provider)}, ${literal(migration.checksum)},
        ${migration.revision}, ${literal(migration.introducedIn)}, ${literal(attemptId)}${provenanceValues})
ON CONFLICT (connector_instance_id, integration_kind, connector_key, lineage_id, migration_id) DO NOTHING;`;
}

type MigrationLedgerIdentity = Pick<
    IntegrationConnectorMigrationDeployment,
    "connectorKey" | "lineageId" | "connectorInstanceId"
>;

function assertSourcePackageDigest(value: string): void {
    if (!/^[a-f0-9]{64}$/.test(value)) {
        throw new Error("Supabase migration sourcePackageDigest must be a lowercase SHA-256 digest");
    }
}

function assertionBlock(condition: string, message: string): string {
    return `DO $cms_assert$ BEGIN IF ${condition} THEN RAISE EXCEPTION ${literal(message)}; END IF; END $cms_assert$;`;
}
