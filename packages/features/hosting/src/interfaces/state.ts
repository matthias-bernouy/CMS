export interface HostingInstallation {
    readonly format: "ulvia-hosting/v1";
    readonly id: "installation";
    readonly phase: "reserved" | "provisioning" | "ready";
    readonly controlKey: string;
    readonly controlOrigin: string;
    readonly controlInstanceId: string | null;
    readonly revision: number;
}

export type DomainState = "pending" | "verified" | "active" | "disabled";
export type DomainTlsState = "pending" | "ready" | "failed" | "not-required";

export interface HostingDomain {
    readonly hostname: string;
    readonly origin: string;
    readonly instanceId: string;
    readonly claimId: string;
    readonly creationFingerprint: string | null;
    readonly state: DomainState;
    readonly tls: DomainTlsState;
    readonly revision: number;
}

export interface HostingActor {
    readonly instanceId: string;
    readonly subjectId: string;
}

export interface HostingDomainPage {
    readonly items: readonly HostingDomain[];
    readonly nextCursor: string | null;
}
