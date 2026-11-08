import type {
    ProviderInstallationReader,
    ProviderInstallationScope,
    StoredProviderInstallation,
} from "@bernouy/ulvia-providers/installations";
import type { ProviderManifestDigest } from "@bernouy/ulvia-providers";
import type { ProviderManifestLimits } from "@bernouy/ulvia-providers";
import type { ProviderInstallationLimits } from "@bernouy/ulvia-providers/installations";
import type { ProviderInstallationStatus } from "@bernouy/ulvia-providers/installations";

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

export interface ProviderInstallationApprovalCommand {
    readonly candidate: ProviderInstallationCandidate;
    readonly report: unknown;
    readonly preparedAt: string;
    readonly approvedBy: string;
}

export interface ProviderReleaseRetention {
    snapshot(scope: ProviderInstallationScope): Promise<
        Readonly<{
            complete: boolean;
            revision: string;
            releases: readonly Readonly<{ contractId: string; version: string; digest: string; location: string }>[];
        }>
    >;
    isCurrent(scope: ProviderInstallationScope, revision: string): Promise<boolean>;
    /** Trusted host authorization for a fenced, coordinated replacement; ordinary reapproval stays exact. */
    canReplace?(
        candidate: ProviderInstallationCandidate,
        previous: Readonly<{ contractId: string; version: string; digest: string }>,
        next: Readonly<{ contractId: string; version: string; digest: string }>,
    ): Promise<boolean>;
}

export interface ProviderInstallationWorkflowOptions {
    readonly retention?: ProviderReleaseRetention;
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
export interface ProviderInstallationStore extends ProviderInstallationReader {
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
