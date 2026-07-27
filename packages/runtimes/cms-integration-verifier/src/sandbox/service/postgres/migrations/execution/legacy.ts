import type { SQL } from "bun";
import {
    identifyObservedSchemaContract,
    sameObservedSchemaContract,
    type DeclarativeConnectorLegacyAdoptionBaseline,
    type IntegrationConnectorBaselineAdoptionContext,
} from "@bernouy/cms-integrations";
import {
    buildSupabaseBaselineAdoptionSql,
    readSupabaseObservedSchemaContract,
    type SupabaseSchemaCatalogQueryClient,
} from "@bernouy/cms-integrations/supabase";
import type { MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import type { TargetMigrationConnector } from "../types";

export function requireLegacyAdoption(
    selected: TargetMigrationConnector,
    input: MigrationVerificationInputV1,
): DeclarativeConnectorLegacyAdoptionBaseline {
    const source = selected.plan.supportedSources.find(
        (entry) =>
            entry.migrationRevision === input.sourceMigrationRevision &&
            entry.legacyAdoption?.definitionVersion === input.source.version &&
            entry.legacyAdoption.packageDigest === input.source.packageDigest,
    );
    if (!source?.legacyAdoption) {
        throw new TypeError("Legacy source package has no exact reviewed adoption baseline");
    }
    return source.legacyAdoption;
}

export async function adoptLegacySource(
    database: SQL,
    baseline: DeclarativeConnectorLegacyAdoptionBaseline,
    input: MigrationVerificationInputV1,
    attemptId: string,
): Promise<void> {
    const observed = await readSupabaseObservedSchemaContract({
        client: catalogClient(database),
        owner: baseline.observedSchema.owner,
        ownedNamespaces: baseline.observedSchema.namespaces.map((entry) => entry.name),
    });
    if (!sameObservedSchemaContract(observed, baseline.observedSchema)) {
        throw new Error("Legacy source SQL does not match its reviewed adoption baseline");
    }
    const context: IntegrationConnectorBaselineAdoptionContext = {
        integrationKind: input.source.kind,
        sourceVersion: input.source.version,
        sourcePackageDigest: input.source.packageDigest,
        targetVersion: input.target.version,
        targetPackageDigest: input.target.packageDigest,
        connectorKey: input.connectorKey,
        provider: "supabase",
        lineageId: input.lineageId,
        connectorInstanceId: connectorInstanceId(input),
        migrationRevision: input.sourceMigrationRevision,
        baseline,
        coveredMigrations: baseline.coveredMigrations,
        attemptId: `source-${attemptId}`,
    };
    const baselineDigest = (await identifyObservedSchemaContract(baseline.observedSchema)).digest;
    await database.unsafe(buildSupabaseBaselineAdoptionSql(context, baselineDigest));
}

export function connectorInstanceId(input: MigrationVerificationInputV1): string {
    return `verification-${input.connectorKey}`;
}

function catalogClient(database: SQL): SupabaseSchemaCatalogQueryClient {
    return {
        async query(statement, parameters) {
            const values = parameters.map((parameter) =>
                Array.isArray(parameter) ? database.array(parameter, "TEXT") : parameter,
            );
            return (await database.unsafe(statement, values)) as readonly Record<string, unknown>[];
        },
    };
}
