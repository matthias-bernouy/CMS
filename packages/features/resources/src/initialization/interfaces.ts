import type { ContentRepository, ContentCapabilityRequirement, TSystem, TBlocWrite } from "@bernouy/content";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import type { VerifiedResourceArchive } from "resources/interfaces/archive";
import type { ResourceAssets } from "resources/storage/assets";
import type { ResourceTexts } from "resources/storage/texts";
import type { ResourceMetadataStore } from "resources/interfaces/entities";
import type {
    ResourceInitializationReview,
    ResourceInitializationState,
    ResourceInitializationProgress,
    ResourcePreviewPage,
} from "./schemas";

export interface ResourceInitializationStateStore {
    /** Explicit provisioning only; reads and ready-instance startup never initialize missing state. */
    initialize(): Promise<void>;
    read(): Promise<ResourceInitializationState | null>;
    replace(record: ResourceInitializationState, expectedRevision: number): Promise<void>;
}
export type ResourceInitializationExecution = Readonly<{
    fingerprint: string;
    selected: readonly ResolvedContract[];
    denied: readonly Readonly<{ contractId: string; capabilityId: string }>[];
}>;
export interface ResourceInitializationPreview {
    readonly requirements: readonly ContentCapabilityRequirement[];
    readonly pages: readonly ResourcePreviewPage[];
    readonly themeDigest: string;
}
export interface ResourceInitializationGuard {
    readonly signal: AbortSignal;
    assertHeld(): void;
}
export interface ResourceInitializationIntent<Payload> {
    readonly id: string;
    readonly siteId: string;
    readonly kind: string;
    readonly planDigest: string;
    readonly expectedRevision: number;
    readonly sourceStateDigest: string;
    readonly targetStateDigest: string;
    readonly status: "prepared" | "applying" | "completed" | "cancelled";
    readonly createdAt: string;
    readonly payload: Payload;
}
/** Structural host port, shared by site operations without importing Repository or its adapters. */
export interface ResourceInitializationIntents {
    begin<T>(intent: ResourceInitializationIntent<T>): Promise<ResourceInitializationIntent<T>>;
    get<T>(siteId: string, id: string, kind: string): Promise<ResourceInitializationIntent<T> | null>;
    transition(
        siteId: string,
        id: string,
        from: ResourceInitializationIntent<unknown>["status"],
        to: ResourceInitializationIntent<unknown>["status"],
    ): Promise<void>;
    claimMaintenance(siteId: string, id: string): Promise<boolean>;
    assertMaintenance(siteId: string, id: string): Promise<void>;
    releaseMaintenance(siteId: string, id: string): Promise<void>;
    yieldMaintenance(siteId: string, id: string): Promise<void>;
}
export interface ResourceInitializationRetainer {
    /** Private bounded retention per reviewed operation; SHA verification still identifies exact ZIP bytes.
     * Separate review keys prevent one terminal operation from deleting another's pending archive. */
    put(reviewDigest: string, bytes: Blob): Promise<void>;
    get(reviewDigest: string): Promise<Blob | null>;
    remove(reviewDigest: string): Promise<void>;
}
export interface ResourceCopyPorts {
    readonly content: ContentRepository;
    /** Append-only raw artifact persistence follows complete archive and candidate validation. */
    readonly createBloc: (artifact: TBlocWrite) => Promise<unknown>;
    readonly metadata: ResourceMetadataStore;
    readonly assets: Pick<ResourceAssets, "putExact" | "getMetadata">;
    readonly texts: Pick<ResourceTexts, "createExact">;
}
export interface ResourceCopyProgress {
    readonly signal: AbortSignal;
    readonly initial: ResourceInitializationProgress;
    assertHeld(): Promise<void>;
    checkpoint(progress: ResourceInitializationProgress): Promise<void>;
}
export interface ResourceInitializationOptions extends ResourceCopyPorts {
    readonly instanceId: string;
    readonly siteId: string;
    readonly state: ResourceInitializationStateStore;
    readonly intents: ResourceInitializationIntents;
    readonly retained: ResourceInitializationRetainer;
    authorize(actorId: string): Promise<void>;
    execution(): Promise<ResourceInitializationExecution>;
    /** Local configured base file only; this is not discovery or an installation catalogue. */
    source(locale: string, signal: AbortSignal): Promise<Readonly<{ digest: string; bytes: Blob }> | null>;
    verify(bytes: Blob, expectedDigest: string, signal: AbortSignal): Promise<VerifiedResourceArchive>;
    /** Host constructs disposable adapters and exercises the same ordinary writes. */
    preview(
        archive: VerifiedResourceArchive | null,
        execution: ResourceInitializationExecution,
        system: TSystem,
        signal: AbortSignal,
    ): Promise<ResourceInitializationPreview>;
    now(): Date;
}
export type ResourcePreparedInitialization = Readonly<{
    review: ResourceInitializationReview;
    archive: VerifiedResourceArchive | null;
}>;
