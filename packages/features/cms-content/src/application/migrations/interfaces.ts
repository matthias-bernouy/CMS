import type {
    CollectionInstallation,
    CollectionMigrationReplacement,
    InstalledCollection,
} from "@bernouy/cms-repository/collections/installations";
import type {
    CollectionMigrationOperation,
    CollectionResourceDescriptor,
    CollectionResourceKind,
} from "@bernouy/cms-repository/collections";
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

export type CollectionMigrationResourceReference = {
    kind: CollectionResourceKind;
    collectionId: string;
    /** Exact resource descriptor ID. Theme token IDs therefore include their collection namespace. */
    id: string;
    location: string;
};

export type CollectionMigrationParticipantSnapshot = {
    id: string;
    digest: string;
    references: readonly CollectionMigrationResourceReference[];
};

export type CollectionMigrationTargetSnapshot = {
    siteId: string;
    collections: readonly InstalledCollection[];
};

export interface CollectionMigrationParticipant {
    readonly id: string;
    collectReferences(siteId: string): Promise<readonly CollectionMigrationResourceReference[]>;
    /** Prepare idempotent feature state before this exact collection snapshot becomes visible. */
    prepareTarget?(target: CollectionMigrationTargetSnapshot): Promise<void>;
}

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
    /** The page was deliberately deleted after migration; rollback keeps it deleted. */
    deletedAfterMigration?: true;
};

export type PreparedCollectionMigration = {
    siteId: string;
    expectedCollectionRevision: number;
    pageRevisionDigest: string;
    /** Digest of site-owned blocs and registered feature references. */
    siteResourceDigest: string;
    /** Digest of the complete executable plan, including exact page snapshots. */
    planDigest: string;
    installationsBefore: readonly CollectionInstallation[];
    replacements: readonly CollectionMigrationReplacement[];
    operationGroups: readonly { collectionId: string; operations: readonly CollectionMigrationOperation[] }[];
    resources: readonly CollectionMigrationResourceChange[];
    pageCount: number;
    /** Digest of every exact affected-page snapshot, independent from any bounded preview. */
    pageChangesDigest: string;
    /** Bounded planning preview; execution stages the complete set directly in the journal. */
    pages: readonly CollectionMigrationPageChange[];
    systemBefore: TSystem;
    /** System projected through the target collection catalogue, before site-owned token migrations are persisted. */
    systemAfterCollectionCommit: TSystem;
    systemAfter: TSystem;
    /** System projected back through the previous catalogue, before the original system snapshot is restored. */
    systemAfterCollectionRollback: TSystem;
    blockedReasons: readonly string[];
};

export type CollectionMigrationRecord = Omit<PreparedCollectionMigration, "pages"> & {
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
    planDigest: string;
    targets: readonly { collectionId: string; fromDigest: string; toDigest: string }[];
    resources: readonly CollectionMigrationResourceChange[];
    pages: readonly { id: string; path: string; revision: number; operations: number }[];
    totalPages: number;
    operationCount: number;
    blockedReasons: readonly string[];
};

export type CollectionMigrationProgress = Pick<
    CollectionMigrationRecord,
    "id" | "siteId" | "status" | "createdAt" | "updatedAt" | "error"
> & {
    totalPages: number;
    pendingPages: number;
    appliedPages: number;
    rolledBackPages: number;
};

export type CollectionMigrationAudit = Pick<
    CollectionMigrationRecord,
    "id" | "siteId" | "createdAt" | "updatedAt" | "error" | "planDigest"
> & {
    status: Extract<CollectionMigrationStatus, "completed" | "rolled-back">;
    targets: readonly { collectionId: string; fromDigest: string; toDigest: string }[];
    resources: readonly CollectionMigrationResourceChange[];
    operationCount: number;
    totalPages: number;
    appliedPages: number;
    rolledBackPages: number;
};

/**
 * Site-wide write barrier used by every public persistence facade. Migration
 * code owns the barrier and deliberately writes through its unfenced stores.
 */
export interface CollectionMigrationWriteFence {
    claimMaintenance(siteId: string, migrationId: string): Promise<boolean>;
    /** Rejects when this process no longer owns the exact renewable maintenance lease. */
    assertMaintenance(siteId: string, migrationId: string): Promise<void>;
    /** Stops renewing ownership while keeping the site locked for an explicit resume or rollback. */
    yieldMaintenance(siteId: string, migrationId: string): Promise<void>;
    releaseMaintenance(siteId: string, migrationId: string): Promise<void>;
    withWrite<T>(siteId: string, operation: () => Promise<T>): Promise<T>;
}

export interface CollectionMigrationStorage extends CollectionMigrationWriteFence {
    get(id: string): Promise<CollectionMigrationRecord | null>;
    getActive(siteId: string): Promise<CollectionMigrationActive | null>;
    getProgress(id: string): Promise<CollectionMigrationProgress | null>;
    listAudits(siteId: string, limit: number): Promise<readonly CollectionMigrationAudit[]>;
    stagePageBatch(id: string, start: number, pages: readonly CollectionMigrationPageChange[]): Promise<void>;
    discardPageStage(id: string): Promise<void>;
    create(record: CollectionMigrationRecord): Promise<boolean>;
    replace(id: string, expectedRevision: number, next: CollectionMigrationRecord): Promise<boolean>;
    getPageBatch(id: string, start: number, limit: number): Promise<readonly CollectionMigrationPageChange[]>;
    replacePage(
        id: string,
        pageId: string,
        expectedState: CollectionMigrationPageChange["state"],
        next: CollectionMigrationPageChange,
    ): Promise<boolean>;
    archiveTerminal(record: CollectionMigrationRecord): Promise<void>;
    pruneTerminal(siteId: string, keep: number): Promise<void>;
}
