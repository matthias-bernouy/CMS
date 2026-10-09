import type { Collection } from "mongodb";
import type { CollectionMigrationAudit, CollectionMigrationProgress } from "../interfaces";
import { auditProgress } from "../storage/audit";
import {
    fromMigrationAuditDocument,
    type MigrationAuditDocument,
    type MigrationDocument,
    type MigrationPageDocument,
} from "./documents";

export async function migrationProgress(
    records: Collection<MigrationDocument>,
    pages: Collection<MigrationPageDocument>,
    audits: Collection<MigrationAuditDocument>,
    id: string,
): Promise<CollectionMigrationProgress | null> {
    const document = await records.findOne(
        { _id: id, ready: true, pruning: { $ne: true } },
        { projection: { _id: 1, siteId: 1, status: 1, createdAt: 1, updatedAt: 1, error: 1, pageCount: 1 } },
    );
    if (!document) {
        const audit = await audits.findOne({ _id: id });
        return audit ? auditProgress(fromMigrationAuditDocument(audit)) : null;
    }
    const [pendingPages, appliedPages, rolledBackPages] = await Promise.all([
        count(pages, { migrationId: id, state: "pending" }),
        count(pages, { migrationId: id, state: "applied" }),
        count(pages, { migrationId: id, state: "rolled-back" }),
    ]);
    return {
        id: document._id,
        siteId: document.siteId,
        status: document.status,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        ...(document.error ? { error: document.error } : {}),
        totalPages: document.pageCount,
        pendingPages,
        appliedPages,
        rolledBackPages,
    };
}

export async function listMigrationAudits(
    audits: Collection<MigrationAuditDocument>,
    siteId: string,
    limit: number,
): Promise<readonly CollectionMigrationAudit[]> {
    const documents = await audits.find({ siteId }).sort({ updatedAt: -1 }).limit(limit).toArray();
    return documents.map(fromMigrationAuditDocument);
}

async function count<T extends { _id: string }>(collection: Collection<T>, filter: object): Promise<number> {
    if (typeof collection.countDocuments === "function") {
        return collection.countDocuments(filter);
    }
    return (await collection.find(filter).toArray()).length;
}
