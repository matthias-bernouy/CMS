import { createHash } from "node:crypto";
import type { CollectionMigrationAudit, CollectionMigrationPageChange, CollectionMigrationRecord } from "../interfaces";

export type MigrationDocument = Omit<CollectionMigrationRecord, "id" | "pages"> & {
    _id: string;
    active?: true;
    ready: boolean;
    pageCount: number;
    pruning?: true;
};

export type MigrationAuditDocument = Omit<CollectionMigrationAudit, "id"> & { _id: string };

export type MigrationPageDocument = CollectionMigrationPageChange & {
    _id: string;
    migrationId: string;
    pageId: string;
    index: number;
    afterContentDigest: string;
};

export const TERMINAL_MIGRATION_STATUSES = ["completed", "rolled-back"] as const;

export function toMigrationDocument(record: CollectionMigrationRecord): MigrationDocument {
    const { id, pages, ...rest } = structuredClone(record);
    return {
        _id: id,
        ...rest,
        ready: true,
        pageCount: pages.length,
        ...(TERMINAL_MIGRATION_STATUSES.includes(record.status as (typeof TERMINAL_MIGRATION_STATUSES)[number])
            ? {}
            : { active: true }),
    };
}

export function toMigrationPageDocument(
    migrationId: string,
    index: number,
    change: CollectionMigrationPageChange,
): MigrationPageDocument {
    const snapshot = structuredClone(change);
    return {
        _id: `${migrationId}:${change.before.id}`,
        migrationId,
        pageId: change.before.id,
        index,
        ...snapshot,
        afterContentDigest: digestText(snapshot.afterContent),
    };
}

export function fromMigrationPageDocument(document: MigrationPageDocument): CollectionMigrationPageChange {
    const {
        _id,
        migrationId: _migrationId,
        pageId: _pageId,
        index: _index,
        afterContentDigest,
        ...snapshot
    } = structuredClone(document);
    if (digestText(snapshot.afterContent) !== afterContentDigest) {
        throw new Error(`Collection migration page snapshot failed its digest: ${_id}`);
    }
    return snapshot;
}

export function toMigrationAuditDocument(audit: CollectionMigrationAudit): MigrationAuditDocument {
    const { id, ...document } = structuredClone(audit);
    return { _id: id, ...document };
}

export function fromMigrationAuditDocument(document: MigrationAuditDocument): CollectionMigrationAudit {
    const { _id, ...audit } = structuredClone(document);
    return { id: _id, ...audit };
}

export function digestText(value: string): string {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
