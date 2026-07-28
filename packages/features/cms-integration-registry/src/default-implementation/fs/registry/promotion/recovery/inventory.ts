import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { withVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { readStablePromotionJournal, type FsIntegrationRegistryStablePromotionJournal } from "../journal";
import type { FsIntegrationRegistryStablePromotionStoragePaths } from "../layout";

const MAX_PROMOTION_JOURNALS = 4_096;

export type StablePromotionJournalInventoryEntry = Readonly<{
    operationId: string;
    path: string;
    valid: boolean;
    journal?: FsIntegrationRegistryStablePromotionJournal;
    error?: unknown;
}>;

export async function stablePromotionJournalInventory(
    storage: FsIntegrationRegistryStablePromotionStoragePaths,
): Promise<readonly StablePromotionJournalInventoryEntry[]> {
    try {
        return await withVerifiedRegistryDirectory(storage.journals, async (descriptorPath) => {
            const directory = await opendir(descriptorPath);
            const entries: StablePromotionJournalInventoryEntry[] = [];
            for await (const entry of directory) {
                if (entries.length >= MAX_PROMOTION_JOURNALS) {
                    throw new Error(
                        `Integration registry contains more than ${MAX_PROMOTION_JOURNALS} promotion journals`,
                    );
                }
                const path = join(storage.journals, entry.name);
                const operationId = entry.name.endsWith(".json") ? entry.name.slice(0, -5) : entry.name;
                if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
                    entries.push({ operationId, path, valid: false });
                    continue;
                }
                try {
                    const journal = await readStablePromotionJournal(join(descriptorPath, entry.name), operationId);
                    entries.push({
                        operationId,
                        path,
                        valid: journal !== null,
                        ...(journal ? { journal } : {}),
                    });
                } catch (error) {
                    entries.push({ operationId, path, valid: false, error });
                }
            }
            return entries.sort((left, right) => compareText(left.operationId, right.operationId));
        });
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
