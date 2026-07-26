import type { IntegrationRegistryRecoveryDiagnostic } from "../../../../../interfaces/recovery";
import { removeFileIfExists } from "../../persistence/canonicalFile";
import { ensureFsIntegrationRegistryLayout } from "../../persistence/layout";
import { quarantineRegistryPath } from "../../recovery/quarantine";
import { reviewedSchemaBaselineImportJournalInventory } from "./inventory";
import { ensureReviewedSchemaBaselineImportStorage } from "./layout";
import type { FsReviewedSchemaBaselineImporterConfig } from "./types";
import { exactBaselineAlreadyStored, identifyReviewedSchemaBaselineImportPolicy } from "./validation";
import { validateAndAppendReviewedSchemaBaselineImport } from "./operation";

export async function recoverReviewedSchemaBaselineImports(
    config: FsReviewedSchemaBaselineImporterConfig,
): Promise<readonly IntegrationRegistryRecoveryDiagnostic[]> {
    const layout = await ensureFsIntegrationRegistryLayout(config.root);
    const storage = await ensureReviewedSchemaBaselineImportStorage(config.root);
    const policyDigest = await identifyReviewedSchemaBaselineImportPolicy(config.approval, config.approvedTargets);
    const diagnostics: IntegrationRegistryRecoveryDiagnostic[] = [];
    for (const entry of await reviewedSchemaBaselineImportJournalInventory(storage)) {
        try {
            if (!entry.valid || !entry.journal) {
                throw (
                    entry.error ?? new Error("Reviewed schema baseline import journal is not a regular canonical file")
                );
            }
            if (entry.journal.policyDigest !== policyDigest) {
                throw new Error("Reviewed schema baseline import policy changed before recovery");
            }
            await config.mutations.runExclusive(entry.journal.request.baseline.kind, async () => {
                const result = await validateAndAppendReviewedSchemaBaselineImport({
                    config,
                    operationId: entry.operationId,
                    request: entry.journal!.request,
                    requestDigest: entry.journal!.requestDigest,
                    policyDigest,
                    journal: false,
                });
                if (!(await exactBaselineAlreadyStored(result.history, entry.journal!.request))) {
                    throw new Error("Recovered reviewed schema baseline differs from its journal");
                }
                await removeFileIfExists(entry.path);
            });
            diagnostics.push({
                code: "schema-baseline-import-replayed",
                source: entry.path,
                message: `Recovered reviewed schema baseline import through ${entry.journal.phase}`,
                operationId: entry.operationId,
                kind: entry.journal.request.baseline.kind,
                version: entry.journal.request.baseline.version,
            });
        } catch (error) {
            await quarantineRegistryPath(layout, entry.operationId, "schema-baseline-import-journal", entry.path);
            diagnostics.push({
                code: "schema-baseline-import-quarantined",
                source: entry.path,
                message: `Quarantined reviewed schema baseline import: ${errorMessage(error)}`,
                operationId: entry.operationId,
                ...(entry.journal
                    ? { kind: entry.journal.request.baseline.kind, version: entry.journal.request.baseline.version }
                    : {}),
            });
        }
    }
    return Object.freeze(diagnostics);
}

function errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
}
