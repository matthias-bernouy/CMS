import type { HostingInstanceState } from "./stores";
import type { HostingDomain } from "./state";

export interface ElectPrimaryDomain {
    readonly instanceId: string;
    readonly hostname: string;
    readonly expectedInstanceRevision: number;
    readonly expectedDomainRevision: number;
}

/** Persisted coordination only; never part of a tenant-facing domain DTO. */
export interface PrimaryDomainElection extends ElectPrimaryDomain {
    readonly token: string;
}

export interface PrimaryDomainStore {
    getDomain(hostname: string): Promise<HostingDomain | null>;
    getPrimaryElection(hostname: string): Promise<PrimaryDomainElection | null>;
    reservePrimaryElection(candidate: PrimaryDomainElection): Promise<PrimaryDomainElection>;
    finishPrimaryElection(election: PrimaryDomainElection, committed: boolean): Promise<HostingDomain>;
}

export interface PrimaryInstanceStore {
    getInstance(instanceId: string): Promise<HostingInstanceState | null>;
    setPublicOrigin(instanceId: string, expectedRevision: number, origin: string): Promise<HostingInstanceState>;
}
