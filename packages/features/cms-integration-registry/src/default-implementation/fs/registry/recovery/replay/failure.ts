import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryRecoveryDiagnostic } from "../../../../../interfaces/recovery";
import { removeFileIfExists, replaceCanonicalJson } from "../../persistence/canonicalFile";
import { readPublicationJournal, type FsIntegrationRegistryPublicationJournal } from "../../persistence/journal";
import { publicationPaths, type FsIntegrationRegistryLayout } from "../../persistence/layout";
import type { PublicationJournalInventoryEntry } from "../inventory";
import { quarantineRegistryPath } from "../quarantine";
import { readCurrentIntegrationIndex, sameIndex } from "../validation";
import { publicationPhaseAtLeast, resolvedRecoveryPackageLimits } from "./state";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export async function quarantineFailedPublication(
    entry: PublicationJournalInventoryEntry,
    layout: FsIntegrationRegistryLayout,
    packageLimits: Partial<IntegrationPackageLimits> | undefined,
    cause: unknown,
): Promise<IntegrationRegistryRecoveryDiagnostic> {
    const limits = resolvedRecoveryPackageLimits(packageLimits);
    let journal: FsIntegrationRegistryPublicationJournal | null = null;
    try {
        if (entry.valid) {
            journal = await readPublicationJournal(entry.path, {
                packageLimits: limits,
                expectedOperationId: entry.operationId,
            });
        }
    } catch {
        // Invalid durable input is quarantined below without trusting its paths.
    }
    if (!journal) {
        await quarantineRegistryPath(layout, entry.operationId, "staging", `${layout.staging}/${entry.operationId}`);
        await quarantineRegistryPath(layout, entry.operationId, "journal", entry.path);
        return diagnostic(entry, cause);
    }
    const paths = publicationPaths(layout, journal.kind, journal.version, journal.operationId);
    let current;
    try {
        current = await readCurrentIntegrationIndex(paths.index);
    } catch (indexError) {
        await quarantineRegistryPath(layout, journal.operationId, "staging", paths.stagingRoot);
        await quarantineRegistryPath(layout, journal.operationId, "journal", paths.journal);
        return diagnostic(
            entry,
            new AggregateError([cause, indexError], "Publication and live index both require operator review"),
            journal,
        );
    }
    const ownsIndex = sameIndex(current, journal.nextIndex);
    const untouchedIndex = sameIndex(current, journal.previousIndex);
    if (ownsIndex) {
        if (journal.previousIndex) {
            await replaceCanonicalJson(paths.index, journal.previousIndex, MAX_INDEX_DOCUMENT_BYTES);
        } else {
            await removeFileIfExists(paths.index);
        }
    }
    if (ownsIndex || untouchedIndex) {
        if (publicationPhaseAtLeast(journal.phase, "manifest-written")) {
            await quarantineRegistryPath(layout, journal.operationId, "manifest", paths.manifest);
        }
        if (publicationPhaseAtLeast(journal.phase, "version-live")) {
            await quarantineRegistryPath(layout, journal.operationId, "version", paths.versionRoot);
        }
    }
    await quarantineRegistryPath(layout, journal.operationId, "staging", paths.stagingRoot);
    await quarantineRegistryPath(layout, journal.operationId, "journal", paths.journal);
    return diagnostic(entry, cause, journal);
}

function diagnostic(
    entry: PublicationJournalInventoryEntry,
    cause: unknown,
    journal?: FsIntegrationRegistryPublicationJournal,
): IntegrationRegistryRecoveryDiagnostic {
    return {
        code: "publication-quarantined",
        source: entry.path,
        message: `Quarantined incomplete integration publication: ${errorMessage(cause)}`,
        operationId: entry.operationId,
        ...(journal ? { kind: journal.kind, version: journal.version } : {}),
    };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
