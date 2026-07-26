import { canonicalJsonBytes, type IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import type { IntegrationRegistryCatalogSnapshotReference } from "../../../../../core/catalog/reference";
import type { IntegrationRegistryRecoveryDiagnostic } from "../../../../../interfaces/recovery";
import { buildFsIntegrationRegistryCatalogSnapshot } from "../../../snapshot/builder";
import { readFsIntegrationCompatibilityReportCollection } from "../../history/store";
import { readJsonFile, removeFileIfExists, replaceCanonicalJson } from "../../persistence/canonicalFile";
import type { FsIntegrationRegistryLayout } from "../../persistence/layout";
import { readStablePromotionRecord, writeStablePromotionRecord } from "../document";
import { sameIntegrationRegistryIndex } from "../index";
import {
    stablePromotionPhaseAtLeast,
    type FsIntegrationRegistryStablePromotionJournal,
    type FsIntegrationRegistryStablePromotionPhase,
    writeStablePromotionJournal,
} from "../journal";
import { stablePromotionPaths, stablePromotionStoragePaths } from "../layout";
import type { StablePromotionJournalInventoryEntry } from "./inventory";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export async function replayStablePromotion(
    input: Readonly<{
        entry: StablePromotionJournalInventoryEntry;
        layout: FsIntegrationRegistryLayout;
        snapshots: IntegrationRegistryCatalogSnapshotReference;
        packageLimits?: Partial<IntegrationPackageLimits>;
    }>,
): Promise<IntegrationRegistryRecoveryDiagnostic> {
    const journal = input.entry.journal;
    if (!input.entry.valid || !journal) {
        throw input.entry.error ?? new Error("Stable promotion journal is not a regular canonical JSON file");
    }
    const snapshot = input.snapshots.current();
    const location = snapshot.locateExactVersion(journal.record.kind, journal.record.version);
    if (!location || location.package.digest !== journal.record.packageDigest) {
        throw new Error("Stable promotion journal references an unavailable package");
    }
    const history = await readFsIntegrationCompatibilityReportCollection(location);
    const referencedReport = history?.reports.find((report) => report.id === journal.record.reportRevisionId);
    if (!history || !referencedReport || !referencedReport.admissible) {
        throw new Error("Stable promotion journal references an absent or ineligible compatibility report");
    }
    const storage = stablePromotionStoragePaths(location.integrationRoot);
    const paths = stablePromotionPaths(storage, journal.operationId, journal.record.id);
    let currentIndex = await readCurrentIndex(paths.index);
    const existingRecord = await readStablePromotionRecord(paths.record);
    if (
        !sameIntegrationRegistryIndex(currentIndex, journal.previousIndex) &&
        !sameIntegrationRegistryIndex(currentIndex, journal.nextIndex)
    ) {
        if (
            stablePromotionPhaseAtLeast(journal.phase, "snapshot-swapped") &&
            sameRecord(existingRecord, journal.record)
        ) {
            await removeFileIfExists(paths.journal);
            return promotionDiagnostic(input.entry, journal, "Finalized an already completed stable promotion journal");
        }
        throw new Error("Live integration index diverged from both stable promotion states");
    }
    if (
        sameIntegrationRegistryIndex(currentIndex, journal.previousIndex) &&
        history.current.id !== journal.record.reportRevisionId
    ) {
        throw new Error("Uncommitted stable promotion report is no longer the current compatibility revision");
    }
    let currentJournal = journal;
    if (sameIntegrationRegistryIndex(currentIndex, journal.previousIndex)) {
        await replaceCanonicalJson(paths.index, journal.nextIndex, MAX_INDEX_DOCUMENT_BYTES);
        currentIndex = journal.nextIndex;
    }
    currentJournal = await advanceAtLeast(paths.journal, currentJournal, "index-written");
    if (existingRecord && !sameRecord(existingRecord, journal.record)) {
        throw new Error("Stable promotion audit record differs from its journal");
    }
    if (!existingRecord) {
        await writeStablePromotionRecord(paths.record, journal.record);
    }
    currentJournal = await advanceAtLeast(paths.journal, currentJournal, "record-written");
    await buildAndSwap(input, journal, currentIndex!);
    currentJournal = await advanceAtLeast(paths.journal, currentJournal, "snapshot-swapped");
    await removeFileIfExists(paths.journal);
    return promotionDiagnostic(
        input.entry,
        currentJournal,
        `Recovered stable promotion through ${currentJournal.phase}`,
    );
}

async function advanceAtLeast(
    path: string,
    journal: FsIntegrationRegistryStablePromotionJournal,
    phase: FsIntegrationRegistryStablePromotionPhase,
): Promise<FsIntegrationRegistryStablePromotionJournal> {
    if (stablePromotionPhaseAtLeast(journal.phase, phase)) {
        return journal;
    }
    const next = { ...journal, phase };
    await writeStablePromotionJournal(path, next);
    return next;
}

async function buildAndSwap(
    input: Pick<Parameters<typeof replayStablePromotion>[0], "layout" | "packageLimits" | "snapshots">,
    journal: FsIntegrationRegistryStablePromotionJournal,
    expectedIndex: IntegrationDefinitionIndex,
): Promise<void> {
    while (true) {
        const expectedSnapshot = input.snapshots.current();
        const next = await buildFsIntegrationRegistryCatalogSnapshot({
            root: input.layout.root,
            packageLimits: input.packageLimits,
        });
        const index = next.getIndex(journal.record.kind);
        const location = next.locateExactVersion(journal.record.kind, journal.record.version);
        if (
            !sameIntegrationRegistryIndex(index, expectedIndex) ||
            !location ||
            location.package.digest !== journal.record.packageDigest
        ) {
            throw new Error("Recovered stable promotion is absent from the validated catalog snapshot");
        }
        if (input.snapshots.compareAndSwap(expectedSnapshot, next)) {
            return;
        }
    }
}

async function readCurrentIndex(path: string): Promise<IntegrationDefinitionIndex | null> {
    const document = await readJsonFile(path, MAX_INDEX_DOCUMENT_BYTES);
    return document ? parseIntegrationDefinitionIndex(document.value, path) : null;
}

function sameRecord(left: unknown, right: unknown): boolean {
    if (left === null || right === null) {
        return left === right;
    }
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}

function promotionDiagnostic(
    entry: StablePromotionJournalInventoryEntry,
    journal: FsIntegrationRegistryStablePromotionJournal,
    message: string,
): IntegrationRegistryRecoveryDiagnostic {
    return {
        code: "stable-promotion-replayed",
        source: entry.path,
        message,
        operationId: journal.operationId,
        kind: journal.record.kind,
        version: journal.record.version,
    };
}
