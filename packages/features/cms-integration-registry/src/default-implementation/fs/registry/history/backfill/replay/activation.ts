import { join } from "node:path";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import { buildFsIntegrationRegistryCatalogSnapshot } from "../../../../snapshot/builder";
import { readJsonFile, replaceCanonicalJson } from "../../../persistence/canonicalFile";
import {
    writeIntegrationVerificationBackfillJournal,
    type FsIntegrationVerificationBackfillJournal,
} from "../document";
import type { FsIntegrationVerificationBackfillerConfig } from "../types";
import { backfilledIntegrationIndex, sameIntegrationIndex } from "../validation";
import { advanceIntegrationVerificationBackfill, notifyIntegrationVerificationBackfillBoundary } from "./phases";

const MAX_INDEX_BYTES = 4 * 1_024 * 1_024;

export async function activateIntegrationVerificationBackfill(
    config: FsIntegrationVerificationBackfillerConfig,
    path: string,
    initial: FsIntegrationVerificationBackfillJournal,
    verificationDigest: string,
): Promise<FsIntegrationVerificationBackfillJournal> {
    const target = initial.request.verification.envelope.target;
    let journal = initial;
    if (!journal.activation) {
        const snapshot = config.snapshots.current();
        const previousIndex = snapshot.getIndex(target.kind);
        const location = snapshot.locateExactVersion(target.kind, target.version);
        if (!previousIndex || !location || location.package.digest !== target.packageDigest) {
            throw new Error("Integration verification backfill target changed before activation");
        }
        const nextIndex = backfilledIntegrationIndex(previousIndex, target.kind, target.version, verificationDigest);
        journal = { ...journal, phase: "activation-prepared", activation: { previousIndex, nextIndex } };
        await writeIntegrationVerificationBackfillJournal(path, journal);
        await notifyIntegrationVerificationBackfillBoundary(config, journal);
    }
    const activation = journal.activation;
    if (
        !activation ||
        !sameIntegrationIndex(
            backfilledIntegrationIndex(activation.previousIndex, target.kind, target.version, verificationDigest),
            activation.nextIndex,
        )
    ) {
        throw new Error("Integration verification backfill activation journal is forged");
    }
    const location = config.snapshots.current().locateExactVersion(target.kind, target.version);
    if (!location || location.package.digest !== target.packageDigest) {
        throw new Error("Integration verification backfill package disappeared before activation");
    }
    const indexPath = join(location.integrationRoot, "integration.json");
    const diskIndex = await readIndex(indexPath);
    if (
        !sameIntegrationIndex(diskIndex, activation.previousIndex) &&
        !sameIntegrationIndex(diskIndex, activation.nextIndex)
    ) {
        throw new Error("Integration verification backfill index diverged from both journal states");
    }
    if (
        sameIntegrationIndex(diskIndex, activation.previousIndex) &&
        !sameIntegrationIndex(diskIndex, activation.nextIndex)
    ) {
        await replaceCanonicalJson(indexPath, activation.nextIndex, MAX_INDEX_BYTES);
    }
    journal = await advanceIntegrationVerificationBackfill(config, path, journal, "index-written");
    await buildAndSwap(config, journal);
    return await advanceIntegrationVerificationBackfill(config, path, journal, "snapshot-swapped");
}

async function buildAndSwap(
    config: FsIntegrationVerificationBackfillerConfig,
    journal: FsIntegrationVerificationBackfillJournal,
): Promise<void> {
    while (true) {
        const expected = config.snapshots.current();
        const next = await buildFsIntegrationRegistryCatalogSnapshot({
            root: config.root,
            packageLimits: config.packageLimits,
        });
        if (
            !sameIntegrationIndex(next.getIndex(journal.request.decision.kind), journal.activation?.nextIndex ?? null)
        ) {
            throw new Error("Backfilled integration is absent from the validated catalog snapshot");
        }
        if (config.snapshots.compareAndSwap(expected, next)) {
            return;
        }
    }
}

async function readIndex(path: string): Promise<IntegrationDefinitionIndex | null> {
    const value = await readJsonFile(path, MAX_INDEX_BYTES);
    return value ? parseIntegrationDefinitionIndex(value.value, path) : null;
}
