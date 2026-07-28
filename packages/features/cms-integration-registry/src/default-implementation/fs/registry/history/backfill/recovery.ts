import { opendir } from "node:fs/promises";
import { join } from "node:path";
import type { IntegrationRegistryRecoveryDiagnostic } from "../../../../../interfaces/recovery";
import { ensureFsIntegrationRegistryLayout } from "../../persistence/layout";
import { withVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { quarantineRegistryPath } from "../../recovery/quarantine";
import { readIntegrationVerificationBackfillJournal, type FsIntegrationVerificationBackfillJournal } from "./document";
import { ensureIntegrationVerificationBackfillStorage } from "./layout";
import { replayIntegrationVerificationBackfill } from "./replay";
import type { FsIntegrationVerificationBackfillerConfig } from "./types";

const MAX_BACKFILL_JOURNALS = 4_096;

type JournalEntry = Readonly<{
    operationId: string;
    path: string;
    journal?: FsIntegrationVerificationBackfillJournal;
    error?: unknown;
}>;

export async function recoverIntegrationVerificationBackfills(
    config: FsIntegrationVerificationBackfillerConfig,
): Promise<readonly IntegrationRegistryRecoveryDiagnostic[]> {
    const layout = await ensureFsIntegrationRegistryLayout(config.root);
    const storage = await ensureIntegrationVerificationBackfillStorage(config.root);
    const diagnostics: IntegrationRegistryRecoveryDiagnostic[] = [];
    for (const entry of await inventory(storage.journals)) {
        try {
            if (!entry.journal) {
                throw entry.error ?? new Error("Verification backfill journal is not a regular canonical file");
            }
            await replayIntegrationVerificationBackfill(config, entry.path, entry.journal);
            diagnostics.push({
                code: "verification-backfill-replayed",
                source: entry.path,
                message: `Recovered integration verification backfill through ${entry.journal.phase}`,
                operationId: entry.operationId,
                kind: entry.journal.request.decision.kind,
                version: entry.journal.request.decision.version,
            });
        } catch (error) {
            await quarantineRegistryPath(layout, entry.operationId, "verification-backfill-journal", entry.path);
            diagnostics.push({
                code: "verification-backfill-quarantined",
                source: entry.path,
                message: `Quarantined integration verification backfill: ${errorMessage(error)}`,
                operationId: entry.operationId,
                ...(entry.journal
                    ? { kind: entry.journal.request.decision.kind, version: entry.journal.request.decision.version }
                    : {}),
            });
        }
    }
    return Object.freeze(diagnostics);
}

async function inventory(journals: string): Promise<readonly JournalEntry[]> {
    return await withVerifiedRegistryDirectory(journals, async (descriptorPath) => {
        const handle = await opendir(descriptorPath);
        const entries: JournalEntry[] = [];
        for await (const entry of handle) {
            if (entries.length >= MAX_BACKFILL_JOURNALS) {
                throw new Error(`Integration registry exceeds ${MAX_BACKFILL_JOURNALS} verification backfill journals`);
            }
            const operationId = entry.name.endsWith(".json") ? entry.name.slice(0, -5) : entry.name;
            const path = join(journals, entry.name);
            if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".json")) {
                entries.push({ operationId, path });
                continue;
            }
            try {
                const journal = await readIntegrationVerificationBackfillJournal(
                    join(descriptorPath, entry.name),
                    operationId,
                );
                entries.push({ operationId, path, ...(journal ? { journal } : {}) });
            } catch (error) {
                entries.push({ operationId, path, error });
            }
        }
        return entries.sort((left, right) => compareText(left.operationId, right.operationId));
    });
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
}
