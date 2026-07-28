import { SQL } from "bun";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { MigrationJobResultV1, MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import { observeConnectorSchemas } from "../application";
import { readBoundarySnapshot, type TableDataProjection } from "../catalog";
import type { SqlConnectorPlan } from "../types";
import type { LoadedMigrationPackage, MatrixState, TargetMigrationConnector } from "./types";

export async function readMatrixState(
    database: SQL,
    selection: MatrixState["selection"],
    target: LoadedMigrationPackage,
    connector: TargetMigrationConnector,
): Promise<MatrixState> {
    const plan = connectorObservationPlan(target, connector);
    const observed = (await observeConnectorSchemas(database, [plan]))[0];
    if (!observed) {
        throw new Error("Target connector schema observation is unavailable");
    }
    const catalog = await readBoundarySnapshot(database, [], connectorDataProjections(connector));
    const ownedRows = catalog.rows.filter((entry) => plan.ownedNamespaces.includes(entry.namespace));
    const contractRows = ownedRows.filter((entry) => entry.objectType !== "table-data");
    const dataRows = ownedRows.filter((entry) => entry.objectType === "table-data");
    const functionDigests: readonly Readonly<{ functionId: string; digest: string }>[] = [];
    const schemaDigest = observed.observedDigest;
    const catalogDigest = await sha256Hex(canonicalJsonBytes(contractRows));
    const dataDigest = await sha256Hex(canonicalJsonBytes(dataRows));
    return {
        selection,
        schemaDigest,
        dataDigest,
        functionDigests,
        stateDigest: await sha256Hex(canonicalJsonBytes({ schemaDigest, dataDigest, functionDigests, catalogDigest })),
    };
}

function connectorDataProjections(connector: TargetMigrationConnector): TableDataProjection[] {
    const declared = connector.connector.compatibility?.schema;
    if (!declared) {
        throw new TypeError("Migration data equivalence requires a declared schema contract");
    }
    return (connector.plan.equivalence?.dataProjections ?? []).map((projection) => {
        const namespace = declared.namespaces.find((entry) => entry.name === projection.namespace);
        const relation = namespace?.relations.find((entry) => entry.name === projection.relation);
        const primaryKey = relation?.constraints.find((entry) => entry.kind === "primary-key");
        if (!relation || !primaryKey || primaryKey.columns.length === 0) {
            throw new TypeError("Migration data equivalence projection does not identify a keyed declared table");
        }
        return { ...projection, primaryKeyColumns: [...primaryKey.columns] };
    });
}

export async function readMigrationLedger(
    database: SQL,
    input: MigrationVerificationInputV1,
): Promise<MigrationJobResultV1["observations"]["ledger"]["rows"]> {
    const rows = (await database.unsafe(
        `select migration_id::text as "migrationId", checksum::text as checksum,
                migration_revision::text as revision, attempt_id::text as "attemptId",
                source_package_digest::text as "sourcePackageDigest",
                target_package_digest::text as "targetPackageDigest"
           from cms_integration_runtime.migration_ledger
          where integration_kind = $1 and connector_key = $2 and lineage_id = $3
          order by migration_revision, migration_id collate "C"`,
        [input.target.kind, input.connectorKey, input.lineageId],
    )) as Array<{
        migrationId: string;
        checksum: `sha256:${string}`;
        revision: string;
        attemptId: string;
        sourcePackageDigest: string | null;
        targetPackageDigest: string | null;
    }>;
    return rows.map((row) => ({
        migrationId: row.migrationId,
        checksum: row.checksum,
        revision: Number(row.revision),
        attemptId: row.attemptId,
        ...(row.sourcePackageDigest === null ? {} : { sourcePackageDigest: row.sourcePackageDigest }),
        ...(row.targetPackageDigest === null ? {} : { targetPackageDigest: row.targetPackageDigest }),
    }));
}

export async function targetInstanceIsExact(database: SQL, input: MigrationVerificationInputV1): Promise<boolean> {
    const rows = (await database.unsafe(
        `select count(*)::int as count from cms_integration_runtime.connector_instances
          where integration_kind = $1 and connector_key = $2 and lineage_id = $3
            and migration_revision = $4 and package_version = $5 and package_digest = $6`,
        [
            input.target.kind,
            input.connectorKey,
            input.lineageId,
            input.targetMigrationRevision,
            input.target.version,
            input.target.packageDigest,
        ],
    )) as Array<{ count: number }>;
    return rows[0]?.count === 1;
}

function connectorObservationPlan(
    _target: LoadedMigrationPackage,
    selected: TargetMigrationConnector,
): SqlConnectorPlan {
    const connector = selected.connector;
    const declaredSchema = connector.compatibility?.schema;
    if (!declaredSchema || !connector.schemas?.length) {
        throw new TypeError("Migration target requires install SQL and a declared schema contract");
    }
    const ownedNamespaces = declaredSchema.namespaces.map((entry) => entry.name).toSorted();
    if (ownedNamespaces.length === 0) {
        throw new TypeError("Migration target requires at least one owned namespace");
    }
    return {
        connectorKey: connector.connectorKey,
        lineageId: connector.lineageId,
        root: connector.root ?? ".",
        schemas: connector.schemas,
        declaredSchema,
        ownedNamespaces,
        dataApiSchemas: [...(connector.dataApiSchemas ?? [])].toSorted(),
    };
}

export async function matrixEvidenceDigest(value: unknown): Promise<string> {
    return await sha256Hex(canonicalJsonBytes(value));
}
