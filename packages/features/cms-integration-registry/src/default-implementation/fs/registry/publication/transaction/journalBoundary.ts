import {
    type FsIntegrationRegistryPublicationJournal,
    type FsIntegrationRegistryPublicationPhase,
    writePublicationJournal,
} from "../../persistence/journal";
import {
    FsIntegrationRegistrySimulatedCrashError,
    type FsIntegrationRegistryPublicationBoundary,
    type FsIntegrationRegistryPublisherConfig,
} from "../types";

export async function advancePublicationJournal(
    path: string,
    journal: FsIntegrationRegistryPublicationJournal,
    phase: FsIntegrationRegistryPublicationPhase,
    maxBytes: number,
): Promise<FsIntegrationRegistryPublicationJournal> {
    const next = { ...journal, phase };
    await writePublicationJournal(path, next, maxBytes);
    return next;
}

export async function notifyPublicationBoundary(
    config: FsIntegrationRegistryPublisherConfig,
    journal: FsIntegrationRegistryPublicationJournal,
): Promise<void> {
    const value = publicationBoundary(journal);
    try {
        await config.afterBoundary?.(value);
    } catch (error) {
        throw new FsIntegrationRegistrySimulatedCrashError(value, error);
    }
}

export function publicationBoundary(
    journal: FsIntegrationRegistryPublicationJournal,
): FsIntegrationRegistryPublicationBoundary {
    return {
        operationId: journal.operationId,
        phase: journal.phase,
        kind: journal.kind,
        version: journal.version,
        digest: journal.digest,
    };
}
