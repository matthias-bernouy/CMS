import type { ProviderInstallation } from "ulvia-providers/installations/interfaces/ProviderInstallation";
import type { ProviderRuntimeObservation } from "ulvia-providers/installations/interfaces/ProviderRuntimeReport";

export interface ProviderInstallationScope {
    readonly installationId: string;
    readonly siteId: string;
}

export interface StoredProviderInstallation {
    readonly installation: ProviderInstallation;
    /** Changes on every mutation, including a new observation. */
    readonly revision: number;
    readonly observation?: ProviderRuntimeObservation;
}

export interface ProviderInstallationReader {
    /** Changes on every installation mutation, including observations. */
    revision?(siteId: string): Promise<string>;
    /** Approved-state revision; observations do not change it. */
    selectionRevision?(siteId: string): Promise<string>;
    get(scope: ProviderInstallationScope): Promise<StoredProviderInstallation | null>;
    list(siteId: string): Promise<readonly StoredProviderInstallation[]>;
}
