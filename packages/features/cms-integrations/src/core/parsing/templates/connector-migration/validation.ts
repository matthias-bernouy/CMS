import type {
    DeclarativeConnectorCompatibility,
    DeclarativeConnectorMigrationPlan,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { sameConnectorMigrationReferences } from "../../../definitions/migrationReferences";
import { integrationVersionSatisfies } from "../../../definitions/versioning";
import { assertMigrationLayoutPath, assertStableMigrationId, invalidMigrationValue } from "./values";

export function validateMigrationAwareConnectorLayout(
    connector: {
        connectorKey?: string;
        lineageId?: string;
        migrationRevision?: number;
        migration?: DeclarativeConnectorMigrationPlan;
        compatibility?: DeclarativeConnectorCompatibility;
        schemas?: Array<{ path: string } | { manifest: string }>;
        functions?: Array<{ directory: string }>;
    },
    name: string,
): void {
    const identityValues = [
        connector.connectorKey,
        connector.lineageId,
        connector.migrationRevision,
        connector.migration,
    ];
    if (identityValues.every((value) => value === undefined)) {
        return;
    }
    if (
        !connector.connectorKey ||
        !connector.lineageId ||
        connector.migrationRevision === undefined ||
        !connector.migration
    ) {
        invalidMigrationValue(
            name,
            "connectorKey, lineageId, migrationRevision, and migration must be declared together",
        );
    }
    assertStableMigrationId(connector.connectorKey, `${name}.connectorKey`);
    assertStableMigrationId(connector.lineageId, `${name}.lineageId`);
    if (!Number.isSafeInteger(connector.migrationRevision) || connector.migrationRevision < 0) {
        invalidMigrationValue(`${name}.migrationRevision`, "must be a non-negative safe integer");
    }
    if (connector.migration.install.revision !== connector.migrationRevision) {
        invalidMigrationValue(`${name}.migration.install.revision`, "must equal migrationRevision");
    }
    validateDataProjections(connector.migration, connector.compatibility, name);
    for (const source of connector.migration.supportedSources) {
        const adoption = source.legacyAdoption;
        if (!adoption) {
            continue;
        }
        if (!integrationVersionSatisfies(adoption.definitionVersion, source.range)) {
            invalidMigrationValue(
                `${name}.migration.supportedSources`,
                "legacy adoption version must satisfy its source range",
            );
        }
        if (adoption.observedSchema.owner.connectorKey !== connector.connectorKey) {
            invalidMigrationValue(
                `${name}.migration.supportedSources`,
                "legacy adoption schema owner connectorKey must match the connector",
            );
        }
        if (adoption.observedSchema.owner.lineageId !== connector.lineageId) {
            invalidMigrationValue(
                `${name}.migration.supportedSources`,
                "legacy adoption schema owner lineageId must match the connector",
            );
        }
        const expectedCoveredMigrations = connector.migration.install.coveredMigrations
            .filter((migration) => migration.revision <= source.migrationRevision)
            .sort(compareMigrationReference);
        if (!sameConnectorMigrationReferences(adoption.coveredMigrations, expectedCoveredMigrations)) {
            invalidMigrationValue(
                `${name}.migration.supportedSources`,
                "legacy adoption coveredMigrations must exactly match the install prefix at its source revision",
            );
        }
    }
    for (const schema of connector.schemas ?? []) {
        assertMigrationLayoutPath("path" in schema ? schema.path : schema.manifest, "install/", `${name}.schemas`);
    }
    for (const fn of connector.functions ?? []) {
        assertMigrationLayoutPath(fn.directory, "functions/", `${name}.functions`);
    }
}

function validateDataProjections(
    migration: DeclarativeConnectorMigrationPlan,
    compatibility: DeclarativeConnectorCompatibility | undefined,
    name: string,
): void {
    for (const projection of migration.equivalence?.dataProjections ?? []) {
        const field = `${name}.migration.equivalence.dataProjections`;
        const namespace = compatibility?.schema?.namespaces.find((entry) => entry.name === projection.namespace);
        const relation = namespace?.relations.find((entry) => entry.name === projection.relation);
        if (!relation) {
            invalidMigrationValue(field, "must reference a relation declared by compatibility.schema");
        }
        const relationKind = relation.kind ?? "table";
        if (relationKind !== "table" && relationKind !== "partitioned-table") {
            invalidMigrationValue(field, "must reference a table or partitioned-table");
        }
        const primaryKeys = relation.constraints.filter((constraint) => constraint.kind === "primary-key");
        if (primaryKeys.length !== 1 || primaryKeys[0]!.columns.length === 0) {
            invalidMigrationValue(field, "must reference a relation with exactly one non-empty primary key");
        }
        const primaryKeyColumns = new Set(primaryKeys[0]!.columns);
        for (const columnName of projection.columns) {
            const column = relation.columns.find((entry) => entry.name === columnName);
            if (!column) {
                invalidMigrationValue(field, `references unknown column "${columnName}"`);
            }
            if (primaryKeyColumns.has(columnName)) {
                invalidMigrationValue(field, `must not project primary-key column "${columnName}"`);
            }
            if (column.type !== "timestamp" && column.type !== "timestamptz") {
                invalidMigrationValue(field, `column "${columnName}" must use timestamp or timestamptz`);
            }
            if (column.nullable) {
                invalidMigrationValue(field, `column "${columnName}" must be NOT NULL`);
            }
            if (column.default !== "now()" && column.default !== "CURRENT_TIMESTAMP") {
                invalidMigrationValue(
                    field,
                    `column "${columnName}" must use canonical now() or CURRENT_TIMESTAMP default`,
                );
            }
        }
    }
}

function compareMigrationReference(
    left: { revision: number; id: string },
    right: { revision: number; id: string },
): number {
    if (left.revision !== right.revision) {
        return left.revision - right.revision;
    }
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
