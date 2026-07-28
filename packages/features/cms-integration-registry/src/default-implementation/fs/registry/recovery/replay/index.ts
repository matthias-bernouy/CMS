import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryCatalogSnapshot } from "../../../../../interfaces/catalog";
import type { IntegrationRegistryRecoveryDiagnostic } from "../../../../../interfaces/recovery";
import { buildFsIntegrationRegistryCatalogSnapshot } from "../../../snapshot/builder";
import { removeFileIfExists, replaceCanonicalJson } from "../../persistence/canonicalFile";
import {
    publicationJournalByteLimit,
    readPublicationJournal,
    type FsIntegrationRegistryPublicationJournal,
    type FsIntegrationRegistryPublicationPhase,
    writePublicationJournal,
} from "../../persistence/journal";
import { publicationPaths, type FsIntegrationRegistryLayout } from "../../persistence/layout";
import { removeImmutableTreeIfExists } from "../../persistence/tree";
import type { FsIntegrationRegistryPublicationConfig } from "../../publication/types";
import type { PublicationJournalInventoryEntry } from "../inventory";
import { readCurrentIntegrationIndex, sameIndex, validateRecoveryJournal } from "../validation";
import { ensureLiveVersion, ensureManifest } from "./artifacts";
export { quarantineFailedPublication } from "./failure";
import { publicationPhaseAtLeast, resolvedRecoveryPackageLimits } from "./state";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;
export async function replayPublicationJournal(
    input: Readonly<{
        entry: PublicationJournalInventoryEntry;
        layout: FsIntegrationRegistryLayout;
        config: Pick<FsIntegrationRegistryPublicationConfig, "snapshots" | "packageLimits">;
    }>,
): Promise<
    Readonly<{ snapshot: IntegrationRegistryCatalogSnapshot; diagnostic: IntegrationRegistryRecoveryDiagnostic }>
> {
    const limits = resolvedRecoveryPackageLimits(input.config.packageLimits);
    const journal = await readPublicationJournal(input.entry.path, {
        packageLimits: limits,
        expectedOperationId: input.entry.operationId,
    });
    if (!journal) {
        throw new Error("Integration registry publication journal disappeared during recovery");
    }
    const candidate = await validateRecoveryJournal(journal, limits);
    const paths = publicationPaths(input.layout, journal.kind, journal.version, journal.operationId);
    const currentIndex = await readCurrentIntegrationIndex(paths.index);
    if (!sameIndex(currentIndex, journal.previousIndex) && !sameIndex(currentIndex, journal.nextIndex)) {
        throw new DivergentRecoveryIndexError(journal);
    }
    let currentJournal = journal;
    await ensureLiveVersion(input.layout, paths, candidate, journal.operationId);
    currentJournal = await advanceAtLeast(paths.journal, currentJournal, "version-live", candidate.limits);
    await ensureManifest(input.layout, paths, candidate, journal.operationId);
    currentJournal = await advanceAtLeast(paths.journal, currentJournal, "manifest-written", candidate.limits);
    if (sameIndex(currentIndex, journal.previousIndex)) {
        await replaceCanonicalJson(paths.index, journal.nextIndex, MAX_INDEX_DOCUMENT_BYTES);
    }
    currentJournal = await advanceAtLeast(paths.journal, currentJournal, "index-written", candidate.limits);
    const snapshot = await buildAndSwap(input.config, input.layout, journal);
    currentJournal = await advanceAtLeast(paths.journal, currentJournal, "snapshot-swapped", candidate.limits);
    await removeImmutableTreeIfExists(paths.stagingRoot);
    await removeFileIfExists(paths.journal);
    return {
        snapshot,
        diagnostic: {
            code: "publication-replayed",
            source: paths.journal,
            message: `Recovered integration publication through ${currentJournal.phase}`,
            operationId: journal.operationId,
            kind: journal.kind,
            version: journal.version,
        },
    };
}

async function advanceAtLeast(
    path: string,
    journal: FsIntegrationRegistryPublicationJournal,
    phase: FsIntegrationRegistryPublicationPhase,
    limits: Readonly<IntegrationPackageLimits>,
): Promise<FsIntegrationRegistryPublicationJournal> {
    if (publicationPhaseAtLeast(journal.phase, phase)) {
        return journal;
    }
    const next = { ...journal, phase };
    await writePublicationJournal(path, next, publicationJournalByteLimit(limits));
    return next;
}

async function buildAndSwap(
    config: Pick<FsIntegrationRegistryPublicationConfig, "snapshots" | "packageLimits">,
    layout: FsIntegrationRegistryLayout,
    journal: FsIntegrationRegistryPublicationJournal,
) {
    while (true) {
        const expected = config.snapshots.current();
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({
            root: layout.root,
            packageLimits: config.packageLimits,
        });
        const location = snapshot.locateExactVersion(journal.kind, journal.version);
        if (!location || location.package.digest !== journal.digest) {
            throw new Error("Recovered publication is absent from the validated catalog snapshot");
        }
        if (config.snapshots.compareAndSwap(expected, snapshot)) {
            return snapshot;
        }
    }
}

class DivergentRecoveryIndexError extends Error {
    constructor(readonly journal: FsIntegrationRegistryPublicationJournal) {
        super(`Live index diverged from both publication states for ${journal.kind}@${journal.version}`);
        this.name = "DivergentRecoveryIndexError";
    }
}
