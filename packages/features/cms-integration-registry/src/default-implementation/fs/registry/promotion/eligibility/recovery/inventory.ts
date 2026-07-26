import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { withVerifiedRegistryDirectory } from "../../../persistence/ownedDirectory";
import { readVersionEligibilityJournal, type FsIntegrationRegistryVersionEligibilityJournal } from "../journal";
import type { FsIntegrationRegistryVersionEligibilityStoragePaths } from "../layout";

const MAX_ELIGIBILITY_JOURNALS = 4_096;

export type VersionEligibilityJournalInventoryEntry = Readonly<{
    operationId: string;
    path: string;
    valid: boolean;
    journal?: FsIntegrationRegistryVersionEligibilityJournal;
    error?: unknown;
}>;

export async function versionEligibilityJournalInventory(
    storage: FsIntegrationRegistryVersionEligibilityStoragePaths,
): Promise<readonly VersionEligibilityJournalInventoryEntry[]> {
    try {
        return await withVerifiedRegistryDirectory(storage.journals, async (descriptorPath) => {
            const directory = await opendir(descriptorPath);
            const entries: VersionEligibilityJournalInventoryEntry[] = [];
            for await (const entry of directory) {
                if (entries.length >= MAX_ELIGIBILITY_JOURNALS) {
                    throw new Error(
                        `Integration registry contains more than ${MAX_ELIGIBILITY_JOURNALS} eligibility journals`,
                    );
                }
                const path = join(storage.journals, entry.name);
                const operationId = entry.name.endsWith(".json") ? entry.name.slice(0, -5) : entry.name;
                if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
                    entries.push({ operationId, path, valid: false });
                    continue;
                }
                try {
                    const journal = await readVersionEligibilityJournal(join(descriptorPath, entry.name), operationId);
                    entries.push({ operationId, path, valid: journal !== null, ...(journal ? { journal } : {}) });
                } catch (error) {
                    entries.push({ operationId, path, valid: false, error });
                }
            }
            return entries.sort((left, right) => left.operationId.localeCompare(right.operationId));
        });
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
