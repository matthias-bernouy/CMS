import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { withVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { readReviewedSchemaBaselineImportJournal, type FsReviewedSchemaBaselineImportJournal } from "./document";
import type { FsReviewedSchemaBaselineImportStorage } from "./layout";

const MAX_IMPORT_JOURNALS = 4_096;

export type ReviewedSchemaBaselineImportJournalInventoryEntry = Readonly<{
    operationId: string;
    path: string;
    valid: boolean;
    journal?: FsReviewedSchemaBaselineImportJournal;
    error?: unknown;
}>;

export async function reviewedSchemaBaselineImportJournalInventory(
    storage: FsReviewedSchemaBaselineImportStorage,
): Promise<readonly ReviewedSchemaBaselineImportJournalInventoryEntry[]> {
    return await withVerifiedRegistryDirectory(storage.journals, async (descriptorPath) => {
        const handle = await opendir(descriptorPath);
        const entries: ReviewedSchemaBaselineImportJournalInventoryEntry[] = [];
        for await (const entry of handle) {
            if (entries.length >= MAX_IMPORT_JOURNALS) {
                throw new Error(
                    `Integration registry contains more than ${MAX_IMPORT_JOURNALS} baseline import journals`,
                );
            }
            const operationId = entry.name.endsWith(".json") ? entry.name.slice(0, -5) : entry.name;
            const path = join(storage.journals, entry.name);
            if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".json")) {
                entries.push({ operationId, path, valid: false });
                continue;
            }
            try {
                const journal = await readReviewedSchemaBaselineImportJournal(
                    join(descriptorPath, entry.name),
                    operationId,
                );
                entries.push({ operationId, path, valid: journal !== null, ...(journal ? { journal } : {}) });
            } catch (error) {
                entries.push({ operationId, path, valid: false, error });
            }
        }
        return entries.sort((left, right) => compareText(left.operationId, right.operationId));
    });
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
