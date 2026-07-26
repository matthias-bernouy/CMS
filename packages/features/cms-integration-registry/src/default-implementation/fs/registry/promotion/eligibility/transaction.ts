import { dirname } from "node:path";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import type {
    IntegrationRegistryVersionEligibilityRecord,
    IntegrationRegistryVersionEligibilityResult,
} from "../../../../../interfaces/promotion";
import { buildFsIntegrationRegistryCatalogSnapshot } from "../../../snapshot/builder";
import { removeFileIfExists, replaceCanonicalJson } from "../../persistence/canonicalFile";
import {
    createVersionEligibilityJournal,
    type FsIntegrationRegistryVersionEligibilityJournal,
    type FsIntegrationRegistryVersionEligibilityPhase,
    writeVersionEligibilityJournal,
} from "./journal";
import type { FsIntegrationRegistryVersionEligibilityPaths } from "./layout";
import { writeVersionEligibilityRecord } from "./document";
import {
    FsIntegrationRegistryVersionEligibilityRecoveryRequiredError,
    FsIntegrationRegistryVersionEligibilitySimulatedCrashError,
    type FsIntegrationRegistryVersionEligibilityManagerConfig,
} from "./types";
import { sameIntegrationRegistryIndex } from "./channels";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export async function commitFsIntegrationRegistryVersionEligibility(
    input: Readonly<{
        config: FsIntegrationRegistryVersionEligibilityManagerConfig;
        paths: FsIntegrationRegistryVersionEligibilityPaths;
        record: IntegrationRegistryVersionEligibilityRecord;
        previousIndex: IntegrationDefinitionIndex;
        nextIndex: IntegrationDefinitionIndex;
    }>,
): Promise<IntegrationRegistryVersionEligibilityResult> {
    const { config, paths, record, previousIndex, nextIndex } = input;
    let journal: FsIntegrationRegistryVersionEligibilityJournal = {
        schema: "cms.integration.registry.version-eligibility-journal.v1",
        operationId: record.operationId,
        phase: "prepared",
        createdAt: record.createdAt,
        record,
        previousIndex,
        nextIndex,
    };
    const state = { journal: false, index: false, record: false, snapshot: false };
    try {
        await createVersionEligibilityJournal(paths.journal, journal);
        state.journal = true;
        await notifyBoundary(config, journal);
        await replaceCanonicalJson(paths.index, nextIndex, MAX_INDEX_DOCUMENT_BYTES);
        state.index = true;
        journal = await advance(paths.journal, journal, "index-written");
        await notifyBoundary(config, journal);
        await writeVersionEligibilityRecord(paths.record, record);
        state.record = true;
        journal = await advance(paths.journal, journal, "record-written");
        await notifyBoundary(config, journal);
        const snapshot = await buildAndSwap(config, paths, record, nextIndex);
        state.snapshot = true;
        journal = await advance(paths.journal, journal, "snapshot-swapped");
        await notifyBoundary(config, journal);
        await removeFileIfExists(paths.journal);
        return { operationId: record.operationId, record, snapshot };
    } catch (error) {
        if (error instanceof FsIntegrationRegistryVersionEligibilitySimulatedCrashError) {
            throw error;
        }
        if (state.snapshot) {
            throw new FsIntegrationRegistryVersionEligibilityRecoveryRequiredError(boundary(journal), error);
        }
        const failures: unknown[] = [];
        if (state.index) {
            await capture(failures, replaceCanonicalJson(paths.index, previousIndex, MAX_INDEX_DOCUMENT_BYTES));
        }
        if (state.record) {
            await capture(failures, removeFileIfExists(paths.record));
        }
        if (state.journal) {
            await capture(failures, removeFileIfExists(paths.journal));
        }
        if (failures.length > 0) {
            throw new AggregateError([error, ...failures], "Version eligibility mutation and rollback failed");
        }
        throw error;
    }
}

async function buildAndSwap(
    config: FsIntegrationRegistryVersionEligibilityManagerConfig,
    paths: FsIntegrationRegistryVersionEligibilityPaths,
    record: IntegrationRegistryVersionEligibilityRecord,
    expectedIndex: IntegrationDefinitionIndex,
) {
    while (true) {
        const expected = config.snapshots.current();
        const next = await buildFsIntegrationRegistryCatalogSnapshot({
            root: config.root,
            packageLimits: config.packageLimits,
        });
        const location = next.locateExactVersion(record.kind, record.version);
        if (
            !sameIntegrationRegistryIndex(next.getIndex(record.kind), expectedIndex) ||
            !location ||
            location.package.digest !== record.packageDigest ||
            dirname(paths.index) !== location.integrationRoot
        ) {
            throw new Error("Version eligibility mutation is absent from the validated catalog snapshot");
        }
        if (config.snapshots.compareAndSwap(expected, next)) {
            return next;
        }
    }
}

async function advance(
    path: string,
    journal: FsIntegrationRegistryVersionEligibilityJournal,
    phase: FsIntegrationRegistryVersionEligibilityPhase,
): Promise<FsIntegrationRegistryVersionEligibilityJournal> {
    const next = { ...journal, phase };
    await writeVersionEligibilityJournal(path, next);
    return next;
}

async function notifyBoundary(
    config: FsIntegrationRegistryVersionEligibilityManagerConfig,
    journal: FsIntegrationRegistryVersionEligibilityJournal,
): Promise<void> {
    try {
        await config.afterBoundary?.(boundary(journal));
    } catch (error) {
        throw new FsIntegrationRegistryVersionEligibilitySimulatedCrashError(boundary(journal), error);
    }
}

function boundary(journal: FsIntegrationRegistryVersionEligibilityJournal) {
    return {
        operationId: journal.operationId,
        recordId: journal.record.id,
        phase: journal.phase,
        action: journal.record.action,
        kind: journal.record.kind,
        version: journal.record.version,
        decisionRevisionId: journal.record.decision.revisionId,
        decisionDigest: journal.record.decision.digest,
    } as const;
}

async function capture(failures: unknown[], operation: Promise<void>): Promise<void> {
    try {
        await operation;
    } catch (error) {
        failures.push(error);
    }
}
