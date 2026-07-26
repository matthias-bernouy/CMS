import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import type { IntegrationRegistryRecoveryDiagnostic } from "../../../../../../interfaces/recovery";
import { readJsonFile, replaceCanonicalJson } from "../../../persistence/canonicalFile";
import type { FsIntegrationRegistryLayout } from "../../../persistence/layout";
import { quarantineRegistryPath } from "../../../recovery/quarantine";
import { sameIntegrationRegistryIndex } from "../channels";
import { readVersionEligibilityRecord } from "../document";
import { versionEligibilityPaths, versionEligibilityStoragePaths } from "../layout";
import type { VersionEligibilityJournalInventoryEntry } from "./inventory";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export async function quarantineFailedVersionEligibility(
    entry: VersionEligibilityJournalInventoryEntry,
    layout: FsIntegrationRegistryLayout,
    integrationRoot: string,
    cause: unknown,
): Promise<IntegrationRegistryRecoveryDiagnostic> {
    const journal = entry.journal;
    if (!journal) {
        await quarantineRegistryPath(layout, entry.operationId, "version-eligibility-journal", entry.path);
        return diagnostic(entry, cause);
    }
    const paths = versionEligibilityPaths(
        versionEligibilityStoragePaths(integrationRoot),
        journal.operationId,
        journal.record.id,
    );
    let recordMatches = false;
    try {
        const existing = await readVersionEligibilityRecord(paths.record);
        recordMatches = sameJson(existing, journal.record);
        if (existing && !recordMatches) {
            await quarantineRegistryPath(layout, journal.operationId, "version-eligibility-record", paths.record);
        }
    } catch {
        await quarantineRegistryPath(layout, journal.operationId, "version-eligibility-record", paths.record);
    }
    try {
        const current = await readCurrentIndex(paths.index);
        if (sameIntegrationRegistryIndex(current, journal.nextIndex) && !recordMatches) {
            await replaceCanonicalJson(paths.index, journal.previousIndex, MAX_INDEX_DOCUMENT_BYTES);
        }
    } catch (error) {
        cause = new AggregateError([cause, error], "Version eligibility and live index require operator review");
    }
    await quarantineRegistryPath(layout, journal.operationId, "version-eligibility-journal", entry.path);
    return diagnostic(entry, cause, journal.record.kind, journal.record.version);
}

async function readCurrentIndex(path: string) {
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
    cause: unknown,
    kind?: string,
    version?: string,
): IntegrationRegistryRecoveryDiagnostic {
    return {
        code: "version-eligibility-quarantined",
        source: entry.path,
        message: `Quarantined incomplete version eligibility mutation: ${errorMessage(cause)}`,
        operationId: entry.operationId,
        ...(kind ? { kind } : {}),
        ...(version ? { version } : {}),
    };
}

function errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
}
