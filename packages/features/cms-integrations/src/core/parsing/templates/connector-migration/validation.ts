import type { DeclarativeConnectorMigrationPlan } from "../../../../interfaces/IntegrationConnectorDeployer";
import { integrationVersionSatisfies } from "../../../definitions/versioning";
import { assertMigrationLayoutPath, assertStableMigrationId, invalidMigrationValue } from "./values";

export function validateMigrationAwareConnectorLayout(
    connector: {
        connectorKey?: string;
        lineageId?: string;
        migrationRevision?: number;
        migration?: DeclarativeConnectorMigrationPlan;
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
    }
    for (const schema of connector.schemas ?? []) {
        assertMigrationLayoutPath("path" in schema ? schema.path : schema.manifest, "install/", `${name}.schemas`);
    }
    for (const fn of connector.functions ?? []) {
        assertMigrationLayoutPath(fn.directory, "functions/", `${name}.functions`);
    }
}
