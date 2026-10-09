import type { Collection } from "mongodb";
import { migrationAudit } from "../storage/audit";
import {
    TERMINAL_MIGRATION_STATUSES,
    fromMigrationDocument,
    toMigrationAuditDocument,
    type MigrationAuditDocument,
    type MigrationDocument,
    type MigrationPageDocument,
} from "./documents";

const STAGED_TTL_MS = 10 * 60_000;

export async function cleanupStagedMigrations(
    records: Collection<MigrationDocument>,
    pages: Collection<MigrationPageDocument>,
): Promise<void> {
    const staged = await records
        .find({ ready: false, createdAt: { $lt: new Date(Date.now() - STAGED_TTL_MS).toISOString() } })
        .toArray();
    for (const { _id } of staged) {
        await pages.deleteMany({ migrationId: _id });
        await records.deleteOne({ _id, ready: false });
    }
}

export async function pruneTerminalMigrations(
    records: Collection<MigrationDocument>,
    pages: Collection<MigrationPageDocument>,
    audits: Collection<MigrationAuditDocument>,
    siteId: string,
    keep: number,
): Promise<void> {
    const terminal = (await records.find({ siteId, ready: true }).toArray())
        .filter(({ status, pruning }) => !pruning && TERMINAL_MIGRATION_STATUSES.includes(terminalStatus(status)))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    for (const document of terminal.slice(Math.max(0, keep))) {
        if ((await count(pages, { migrationId: document._id })) !== document.pageCount) {
            throw new Error(`Incomplete collection migration journal during retention: ${document._id}`);
        }
        const audit = toMigrationAuditDocument(migrationAudit(fromMigrationDocument(document)));
        await audits.replaceOne({ _id: audit._id }, audit, { upsert: true });
        await records.updateOne({ _id: document._id, pruning: { $ne: true } }, { $set: { pruning: true } });
    }
    await resumeMigrationPruning(records, pages);
}

export async function resumeMigrationPruning(
    records: Collection<MigrationDocument>,
    pages: Collection<MigrationPageDocument>,
): Promise<void> {
    const pruning = await records.find({ pruning: true }).toArray();
    for (const { _id } of pruning) {
        await pages.deleteMany({ migrationId: _id });
        await records.deleteOne({ _id, pruning: true });
    }
}

async function count<T extends { _id: string }>(collection: Collection<T>, filter: object): Promise<number> {
    if (typeof collection.countDocuments === "function") {
        return collection.countDocuments(filter);
    }
    return (await collection.find(filter).toArray()).length;
}

function terminalStatus(status: MigrationDocument["status"]): (typeof TERMINAL_MIGRATION_STATUSES)[number] {
    return status as (typeof TERMINAL_MIGRATION_STATUSES)[number];
}
