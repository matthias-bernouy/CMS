import type { CollectionMigrationAudit, CollectionMigrationProgress, CollectionMigrationRecord } from "../interfaces";

export function migrationAudit(record: CollectionMigrationRecord): CollectionMigrationAudit {
    if (record.status !== "completed" && record.status !== "rolled-back") {
        throw new TypeError(`Cannot archive non-terminal collection migration ${record.id}`);
    }
    return {
        id: record.id,
        siteId: record.siteId,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        planDigest: record.planDigest,
        ...(record.error ? { error: record.error } : {}),
        targets: record.replacements.map((replacement) => ({
            collectionId: replacement.collectionId,
            fromDigest: record.installationsBefore.find(
                ({ collectionId }) => collectionId === replacement.collectionId,
            )!.digest,
            toDigest: replacement.digest,
        })),
        resources: structuredClone(record.resources),
        operationCount: record.operationGroups.reduce((count, group) => count + group.operations.length, 0),
        totalPages: record.pageCount,
        appliedPages: record.status === "completed" ? record.pageCount : 0,
        rolledBackPages: record.status === "rolled-back" ? record.pageCount : 0,
    };
}

export function auditProgress(audit: CollectionMigrationAudit): CollectionMigrationProgress {
    return {
        id: audit.id,
        siteId: audit.siteId,
        status: audit.status,
        createdAt: audit.createdAt,
        updatedAt: audit.updatedAt,
        ...(audit.error ? { error: audit.error } : {}),
        totalPages: audit.totalPages,
        pendingPages: 0,
        appliedPages: audit.appliedPages,
        rolledBackPages: audit.rolledBackPages,
    };
}
