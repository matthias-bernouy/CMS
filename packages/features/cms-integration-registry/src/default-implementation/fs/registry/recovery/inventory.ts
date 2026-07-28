import { opendir } from "node:fs/promises";
import { join } from "node:path";
import type { FsIntegrationRegistryLayout } from "../persistence/layout";

const MAX_RECOVERY_ENTRIES = 4_096;

export type PublicationJournalInventoryEntry = Readonly<{
    operationId: string;
    path: string;
    valid: boolean;
}>;

export async function publicationJournalInventory(
    layout: FsIntegrationRegistryLayout,
): Promise<readonly PublicationJournalInventoryEntry[]> {
    const entries = await boundedEntries(layout.journals);
    return entries
        .map((entry) => ({
            operationId: entry.name.endsWith(".json") ? entry.name.slice(0, -5) : entry.name,
            path: join(layout.journals, entry.name),
            valid: entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".json"),
        }))
        .sort((left, right) => compareText(left.operationId, right.operationId));
}

export async function stagingInventory(layout: FsIntegrationRegistryLayout): Promise<readonly string[]> {
    return (await boundedEntries(layout.staging)).map((entry) => join(layout.staging, entry.name)).sort(compareText);
}

export async function boundedDirectoryNames(path: string): Promise<readonly string[]> {
    return (await boundedEntries(path)).map((entry) => entry.name).sort(compareText);
}

async function boundedEntries(path: string) {
    const result = [];
    const handle = await opendir(path);
    for await (const entry of handle) {
        result.push(entry);
        if (result.length > MAX_RECOVERY_ENTRIES) {
            throw new Error(`Integration registry recovery directory exceeds ${MAX_RECOVERY_ENTRIES} entries: ${path}`);
        }
    }
    return result;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
