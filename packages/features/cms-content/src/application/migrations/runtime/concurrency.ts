import type { CollectionMigrationPageChange, CollectionMigrationRecord } from "../interfaces";
import type { MigrationJournal } from "./journal";

const PAGE_OPERATION_CONCURRENCY = 16;
const JOURNAL_PAGE_BATCH_SIZE = 500;

export async function forEachMigrationPage<T>(
    items: readonly T[],
    operation: (item: T) => Promise<void>,
): Promise<void> {
    for (let start = 0; start < items.length; start += PAGE_OPERATION_CONCURRENCY) {
        const results = await Promise.allSettled(items.slice(start, start + PAGE_OPERATION_CONCURRENCY).map(operation));
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") {
            throw failed.reason;
        }
    }
}

export async function* migrationPageBatches(
    journal: MigrationJournal,
    record: Pick<CollectionMigrationRecord, "id" | "pageCount">,
    reverse = false,
): AsyncGenerator<readonly CollectionMigrationPageChange[]> {
    if (reverse) {
        for (let end = record.pageCount; end > 0; ) {
            const start = Math.max(0, end - JOURNAL_PAGE_BATCH_SIZE);
            const pages = await journal.pageBatch(record.id, start, end - start);
            assertCompleteBatch(record.id, pages.length, end - start);
            yield [...pages].reverse();
            end = start;
        }
        return;
    }
    for (let start = 0; start < record.pageCount; start += JOURNAL_PAGE_BATCH_SIZE) {
        const limit = Math.min(JOURNAL_PAGE_BATCH_SIZE, record.pageCount - start);
        const pages = await journal.pageBatch(record.id, start, limit);
        assertCompleteBatch(record.id, pages.length, limit);
        yield pages;
    }
}

async function* migrationPages(
    journal: MigrationJournal,
    record: Pick<CollectionMigrationRecord, "id" | "pageCount">,
): AsyncGenerator<CollectionMigrationPageChange> {
    for await (const pages of migrationPageBatches(journal, record)) {
        yield* pages;
    }
}

export function migrationPageIterator(
    journal: MigrationJournal,
    record: Pick<CollectionMigrationRecord, "id" | "pageCount">,
): AsyncIterator<CollectionMigrationPageChange> {
    return migrationPages(journal, record)[Symbol.asyncIterator]();
}

function assertCompleteBatch(id: string, actual: number, expected: number): void {
    if (actual !== expected) {
        throw new Error(`Incomplete collection migration page journal: ${id}`);
    }
}
