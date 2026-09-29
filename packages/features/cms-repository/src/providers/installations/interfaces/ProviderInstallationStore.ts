import type { ProviderManifestDigest } from "cms-repository/providers/manifests/core/admission/admitProviderManifest";
import type { ProviderManifestLimits } from "cms-repository/providers/manifests/core/limits";
import type { ProviderInstallationLimits } from "../core/limits";
import type { ProviderInstallation, ProviderInstallationStatus } from "./ProviderInstallation";
import type { ProviderRuntimeObservation } from "./ProviderRuntimeReport";

export interface ProviderInstallationScope {
    readonly installationId: string;
    readonly siteId: string;
}

export interface ProviderInstallationCandidate {
    readonly id: string;
    readonly siteId: string;
    readonly providerId: string;
    readonly accountId: string;
    readonly endpoint: string;
    readonly manifestVersion: string;
    readonly manifestDigest: ProviderManifestDigest;
    readonly providerTokenRef: string;
    readonly gatewayTokenRef?: string;
    readonly configuration: Readonly<Record<string, unknown>>;
}

export interface StoredProviderInstallation {
    readonly installation: ProviderInstallation;
    /** Changes on every mutation, including a new observation. */
    readonly revision: number;
    readonly observation?: ProviderRuntimeObservation;
}

export interface ProviderInstallationApprovalCommand {
    readonly candidate: ProviderInstallationCandidate;
    readonly report: unknown;
    readonly preparedAt: string;
    readonly approvedBy: string;
}

export interface ProviderInstallationWorkflowOptions {
    readonly limits?: Readonly<ProviderInstallationLimits>;
    readonly manifestLimits?: Readonly<ProviderManifestLimits>;
    readonly maxPreparationAgeMs?: number;
}

/** Inject a CMS clock. Provider timestamps are never used for stored observations. */
export type ProviderInstallationClock = () => string;

/**
 * Trusted host command boundary: the caller must authorize each site-scoped action.
 * Parsing an installation, possessing a preparation, or knowing an actor ID is not authorization.
 * Adapters must enforce validation, CAS, terminal revocation and immutable connection identity.
 */
export interface ProviderInstallationStore {
    /** Optional site-scoped token that changes on every installation mutation. */
    revision?(siteId: string): Promise<string>;
    get(scope: ProviderInstallationScope): Promise<StoredProviderInstallation | null>;
    list(siteId: string): Promise<readonly StoredProviderInstallation[]>;
    approve(command: ProviderInstallationApprovalCommand): Promise<StoredProviderInstallation>;
    reapprove(
        scope: ProviderInstallationScope,
        expectedRevision: number,
        command: ProviderInstallationApprovalCommand,
    ): Promise<StoredProviderInstallation>;
    setStatus(
        scope: ProviderInstallationScope,
        expectedRevision: number,
        status: ProviderInstallationStatus,
    ): Promise<StoredProviderInstallation>;
    recordObservation(
        scope: ProviderInstallationScope,
        expectedRevision: number,
        report: unknown,
    ): Promise<StoredProviderInstallation>;
}
