import type {
    CollectionInstallation,
    CollectionMigrationReplacement,
} from "@bernouy/cms-repository/collections/installations";
import type { CollectionMigrationOperation, CollectionResourceDescriptor } from "@bernouy/cms-repository/collections";
import type { TPage } from "cms-content/pages/interfaces/pages";
import type { TSystem } from "cms-content/settings/interfaces/settings";

export type CollectionMigrationStatus =
    | "planning"
    | "snapshotting"
    | "migrating"
    | "validating"
    | "committing"
    | "rolling-back"
    | "failed"
    | "completed"
    | "rolled-back";

export type CollectionMigrationTarget = {
    digest: string;
    repositoryId?: string;
};

export type CollectionMigrationResourceChange = {
    collectionId: string;
    kind: CollectionResourceDescriptor["kind"];
    id: string;
    change: "added" | "removed" | "implementation" | "contract-compatible" | "contract-breaking";
    fromGeneration?: number;
    toGeneration?: number;
};

export type CollectionMigrationPageChange = {
    before: TPage;
    afterContent: string;
    operations: number;
    state: "pending" | "applied" | "rolled-back";
    appliedRevision?: number;
    rolledBackRevision?: number;
};

export type PreparedCollectionMigration = {
    siteId: string;
    expectedCollectionRevision: number;
    pageRevisionDigest: string;
    installationsBefore: readonly CollectionInstallation[];
    replacements: readonly CollectionMigrationReplacement[];
    operationGroups: readonly { collectionId: string; operations: readonly CollectionMigrationOperation[] }[];
    resources: readonly CollectionMigrationResourceChange[];
    pages: readonly CollectionMigrationPageChange[];
    systemBefore: TSystem;
    /** System projected through the target collection catalogue, before site-owned token migrations are persisted. */
    systemAfterCollectionCommit: TSystem;
    systemAfter: TSystem;
    /** System projected back through the previous catalogue, before the original system snapshot is restored. */
    systemAfterCollectionRollback: TSystem;
    blockedReasons: readonly string[];
};

export type CollectionMigrationRecord = PreparedCollectionMigration & {
    id: string;
    revision: number;
    status: CollectionMigrationStatus;
    createdAt: string;
    updatedAt: string;
    collectionRevisionAfterCommit?: number;
    collectionRevisionAfterRollback?: number;
    rollbackStartedAt?: string;
    error?: string;
};

export type CollectionMigrationActive = Pick<CollectionMigrationRecord, "id" | "siteId" | "status" | "updatedAt">;

export type CollectionMigrationSummary = {
    siteId: string;
    expectedCollectionRevision: number;
    targets: readonly { collectionId: string; fromDigest: string; toDigest: string }[];
    resources: readonly CollectionMigrationResourceChange[];
    pages: readonly { id: string; path: string; revision: number; operations: number }[];
    operationCount: number;
    blockedReasons: readonly string[];
};

export interface CollectionMigrationStorage {
    get(id: string): Promise<CollectionMigrationRecord | null>;
    getActive(siteId: string): Promise<CollectionMigrationActive | null>;
    create(record: CollectionMigrationRecord): Promise<boolean>;
    replace(id: string, expectedRevision: number, next: CollectionMigrationRecord): Promise<boolean>;
    replacePage(
        id: string,
        pageId: string,
        expectedState: CollectionMigrationPageChange["state"],
        next: CollectionMigrationPageChange,
    ): Promise<boolean>;
}
