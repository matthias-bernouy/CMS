import type { HostingDomain, HostingDomainPage, HostingInstallation } from "./state";

export interface HostingInstallationStore {
    readInstallation(): Promise<HostingInstallation | null>;
    reserveInstallation(candidate: HostingInstallation): Promise<HostingInstallation>;
    bindControl(expectedRevision: number, instanceId: string): Promise<HostingInstallation>;
    completeInstallation(expectedRevision: number): Promise<HostingInstallation>;
}

export interface HostingDomainStore {
    getDomain(hostname: string): Promise<HostingDomain | null>;
    claimDomain(candidate: HostingDomain): Promise<HostingDomain>;
    replaceDomain(expectedRevision: number, candidate: HostingDomain): Promise<HostingDomain>;
    listDomains(input: { instanceId: string; after: string | null; limit: number }): Promise<HostingDomainPage>;
    /** Background delivery reconciliation only; request routing uses getDomain. */
    scanDomains(input: { after: string | null; limit: number }): Promise<HostingDomainPage>;
}

export interface HostingInstanceState {
    readonly cmsUrl: string;
    /** Runtime-owned logical origins, when supplied by the instance registry. */
    readonly gatewayUrl?: string;
    readonly repository?: { readonly url: string; readonly configured: boolean };
    readonly id: string;
    readonly revision: number;
    readonly status: "provisioning" | "upgrading" | "ready" | "failed" | "disabled";
}

export interface HostingInstanceReader {
    getInstance(instanceId: string): Promise<HostingInstanceState | null>;
}
