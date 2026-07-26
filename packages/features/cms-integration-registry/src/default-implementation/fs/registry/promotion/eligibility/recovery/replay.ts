import { canonicalJsonBytes, type IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import { identifyReleaseAdmissionDecision } from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCatalogSnapshotReference } from "../../../../../../core/catalog/reference";
import type { IntegrationRegistryRecoveryDiagnostic } from "../../../../../../interfaces/recovery";
import type { ReleaseAdmissionDecisionStore } from "../../../../../../interfaces/reportStore";
import { buildFsIntegrationRegistryCatalogSnapshot } from "../../../../snapshot/builder";
import { readJsonFile, removeFileIfExists, replaceCanonicalJson } from "../../../persistence/canonicalFile";
import type { FsIntegrationRegistryLayout } from "../../../persistence/layout";
import { sameIntegrationRegistryIndex } from "../channels";
import { readVersionEligibilityRecord, writeVersionEligibilityRecord } from "../document";
import {
    versionEligibilityPhaseAtLeast,
    type FsIntegrationRegistryVersionEligibilityJournal,
    type FsIntegrationRegistryVersionEligibilityPhase,
    writeVersionEligibilityJournal,
} from "../journal";
import { versionEligibilityPaths, versionEligibilityStoragePaths } from "../layout";
import type { VersionEligibilityJournalInventoryEntry } from "./inventory";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export async function replayVersionEligibility(
    input: Readonly<{
        entry: VersionEligibilityJournalInventoryEntry;
        layout: FsIntegrationRegistryLayout;
        snapshots: IntegrationRegistryCatalogSnapshotReference;
        decisions: ReleaseAdmissionDecisionStore;
        packageLimits?: Partial<IntegrationPackageLimits>;
    }>,
): Promise<IntegrationRegistryRecoveryDiagnostic> {
    const journal = input.entry.journal;
    if (!input.entry.valid || !journal) {
        throw input.entry.error ?? new Error("Invalid eligibility journal entry");
    }
    const snapshot = input.snapshots.current();
    const location = snapshot.locateExactVersion(journal.record.kind, journal.record.version);
    if (!location || location.package.digest !== journal.record.packageDigest) {
        throw new Error("Version eligibility journal references an unavailable package");
    }
    const storage = versionEligibilityStoragePaths(location.integrationRoot);
    const paths = versionEligibilityPaths(storage, journal.operationId, journal.record.id);
    let currentIndex = await readCurrentIndex(paths.index);
    const existingRecord = await readVersionEligibilityRecord(paths.record);
    if (
        !sameIntegrationRegistryIndex(currentIndex, journal.previousIndex) &&
        !sameIntegrationRegistryIndex(currentIndex, journal.nextIndex)
    ) {
        if (
            versionEligibilityPhaseAtLeast(journal.phase, "snapshot-swapped") &&
            sameJson(existingRecord, journal.record)
        ) {
            await removeFileIfExists(paths.journal);
            return diagnostic(input.entry, journal, "Finalized an already completed eligibility mutation");
        }
        throw new Error("Live integration index diverged from both eligibility mutation states");
    }
    await assertDecision(input.decisions, journal, sameIntegrationRegistryIndex(currentIndex, journal.previousIndex));
    let currentJournal = journal;
    if (sameIntegrationRegistryIndex(currentIndex, journal.previousIndex)) {
        await replaceCanonicalJson(paths.index, journal.nextIndex, MAX_INDEX_DOCUMENT_BYTES);
        currentIndex = journal.nextIndex;
    }
    currentJournal = await advanceAtLeast(paths.journal, currentJournal, "index-written");
    if (existingRecord && !sameJson(existingRecord, journal.record)) {
        throw new Error("Version eligibility audit record differs from its journal");
    }
    if (!existingRecord) {
        await writeVersionEligibilityRecord(paths.record, journal.record);
    }
    currentJournal = await advanceAtLeast(paths.journal, currentJournal, "record-written");
    await buildAndSwap(input, journal, currentIndex!);
    currentJournal = await advanceAtLeast(paths.journal, currentJournal, "snapshot-swapped");
    await removeFileIfExists(paths.journal);
    return diagnostic(input.entry, currentJournal, `Recovered eligibility mutation through ${currentJournal.phase}`);
}

async function assertDecision(
    store: ReleaseAdmissionDecisionStore,
    journal: FsIntegrationRegistryVersionEligibilityJournal,
    requireCurrent: boolean,
): Promise<void> {
    const history = requireCurrent
        ? await store.get(journal.record.kind, journal.record.version)
        : await store.getHistory(journal.record.kind, journal.record.version);
    const referenced = history?.revisions.find(
        (decision) => decision.decisionId === journal.record.decision.revisionId,
    );
    const identified = referenced ? await identifyReleaseAdmissionDecision(referenced) : null;
    if (
        !history ||
        !referenced ||
        !identified ||
        identified.digest !== journal.record.decision.digest ||
        referenced.kind !== journal.record.kind ||
        referenced.version !== journal.record.version ||
        referenced.packageDigest !== journal.record.packageDigest ||
        (journal.record.action === "mark-inadmissible" && referenced.admissible)
    ) {
        throw new Error("Version eligibility references an absent, substituted, or adverse-incompatible decision");
    }
    if (
        requireCurrent &&
        (history.currentRevisionId !== journal.record.decision.revisionId ||
            history.currentReportDigest !== journal.record.decision.digest)
    ) {
        throw new Error("Uncommitted version eligibility decision is no longer current");
    }
}

async function buildAndSwap(
    input: Pick<Parameters<typeof replayVersionEligibility>[0], "layout" | "packageLimits" | "snapshots">,
    journal: FsIntegrationRegistryVersionEligibilityJournal,
    expectedIndex: IntegrationDefinitionIndex,
): Promise<void> {
    while (true) {
        const expected = input.snapshots.current();
        const next = await buildFsIntegrationRegistryCatalogSnapshot({
            root: input.layout.root,
            packageLimits: input.packageLimits,
        });
        const location = next.locateExactVersion(journal.record.kind, journal.record.version);
        if (
            !sameIntegrationRegistryIndex(next.getIndex(journal.record.kind), expectedIndex) ||
            !location ||
            location.package.digest !== journal.record.packageDigest
        ) {
            throw new Error("Recovered version eligibility mutation is absent from the validated catalog snapshot");
        }
        if (input.snapshots.compareAndSwap(expected, next)) {
            return;
        }
    }
}

async function advanceAtLeast(
    path: string,
    journal: FsIntegrationRegistryVersionEligibilityJournal,
    phase: FsIntegrationRegistryVersionEligibilityPhase,
): Promise<FsIntegrationRegistryVersionEligibilityJournal> {
    if (versionEligibilityPhaseAtLeast(journal.phase, phase)) {
        return journal;
    }
    const next = { ...journal, phase };
    await writeVersionEligibilityJournal(path, next);
    return next;
}

async function readCurrentIndex(path: string): Promise<IntegrationDefinitionIndex | null> {
    const document = await readJsonFile(path, MAX_INDEX_DOCUMENT_BYTES);
    return document ? parseIntegrationDefinitionIndex(document.value, path) : null;
}

function sameJson(left: unknown, right: unknown): boolean {
    if (left === null || right === null) {
        return left === right;
    }
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}

function diagnostic(
    entry: VersionEligibilityJournalInventoryEntry,
    journal: FsIntegrationRegistryVersionEligibilityJournal,
    message: string,
): IntegrationRegistryRecoveryDiagnostic {
    return {
        code: "version-eligibility-replayed",
        source: entry.path,
        message,
        operationId: journal.operationId,
        kind: journal.record.kind,
        version: journal.record.version,
    };
}
