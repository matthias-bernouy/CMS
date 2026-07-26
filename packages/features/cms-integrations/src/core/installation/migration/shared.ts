import { IntegrationRuntimeError } from "../../errors";
import type { IntegrationImportResult } from "../../../interfaces/IntegrationImport";
import type {
    IntegrationInstallation,
    IntegrationMigrationJournalEntry,
} from "../../../interfaces/IntegrationInstallation";
import type {
    IntegrationMigrationConnectorTransition,
    IntegrationMigrationPhase,
} from "../../../interfaces/IntegrationConnectorDeployer";

export function requiredMigrationOperation(installation: IntegrationInstallation) {
    if (!installation.migrationOperation) {
        throw new IntegrationRuntimeError("integration migration operation is missing");
    }
    return installation.migrationOperation;
}

export function requiredMigrationJournalEntry(
    journal: IntegrationMigrationJournalEntry[],
    phase: IntegrationMigrationPhase,
) {
    const entry = journal.find((candidate) => candidate.phase === phase);
    if (!entry) {
        throw new IntegrationRuntimeError(`integration migration journal is missing phase "${phase}"`);
    }
    return entry;
}

export function mergedMigrationImportResult(journal: IntegrationMigrationJournalEntry[]): IntegrationImportResult {
    const results = journal.flatMap((entry) => (entry.importResult ? [entry.importResult] : []));
    return {
        artifacts: results.flatMap((result) => result.artifacts),
        connectors: results.flatMap((result) => result.connectors ?? []),
        provisions: results.flatMap((result) => result.provisions ?? []),
        secrets: results.flatMap((result) => result.secrets ?? []),
    };
}

export function migrationActivationRevision(connector: IntegrationMigrationConnectorTransition): number {
    return connector.plan.migrations
        .filter(
            (migration) =>
                migration.phase === "expand" &&
                migration.toRevision > connector.fromRevision &&
                migration.toRevision <= connector.toRevision,
        )
        .reduce((revision, migration) => Math.max(revision, migration.toRevision), connector.fromRevision);
}
