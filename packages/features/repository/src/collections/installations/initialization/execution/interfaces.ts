import type { CollectionVerifier } from "../../../sources/verification";
import type { ContentRepository } from "@bernouy/content";
import type { AdmittedCollectionRelease } from "../../../interfaces/CollectionAdmission";
import type { CollectionRepositorySource } from "../../../sources/interfaces";
import type { CollectionStore } from "../../core/CollectionStore";
import type { SiteUpgradeStorage } from "repository/site-upgrades/interfaces";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import type { CollectionInitializationPlan } from "../interfaces";

export type InitializationExecution = Readonly<{
    selected: readonly ResolvedContract[];
    denied: readonly Readonly<{ contractId: string; capabilityId: string }>[];
    /** Includes selection revision, installation approval and observation evidence. */
    fingerprint: string;
}>;

export type InitializationReview = Readonly<{
    instanceId: string;
    siteId: string;
    actorId: string;
    expectedRevision: number;
    systemRevision: number;
    collectionRevision: number;
    executionFingerprint: string;
    plan: CollectionInitializationPlan;
    digest: string;
}>;

export type InitializationRecord = Readonly<{
    protocol: "ulvia-site-initialization/v1";
    siteId: string;
    revision: number;
    status: "pending" | "running" | "completed";
    review: InitializationReview | null;
    pageIds: Readonly<Record<string, string>>;
    completedPages: readonly string[];
}>;

export interface InitializationStateStore {
    /** Called only by explicit instance provisioning, never by a read or ready-instance startup. */
    initialize(siteId: string): Promise<void>;
    read(siteId: string): Promise<InitializationRecord | null>;
    replace(record: InitializationRecord, expectedRevision: number): Promise<void>;
}

export interface InitializationServiceOptions {
    readonly instanceId: string;
    readonly siteId: string;
    readonly verifier?: CollectionVerifier;
    readonly state: InitializationStateStore;
    readonly repository: ContentRepository;
    readonly collections: CollectionStore;
    readonly upgrades: SiteUpgradeStorage;
    readonly source: CollectionRepositorySource;
    readonly execution: () => Promise<InitializationExecution>;
    /** Runtime composes disposable adapters and exercises the ordinary Content writes. */
    readonly validateCandidate: (
        plan: CollectionInitializationPlan,
        artifacts: readonly AdmittedCollectionRelease[],
        execution: InitializationExecution,
    ) => Promise<void>;
}
