export interface HostingZone {
    readonly format: "ulvia-hosting-zone/v1";
    readonly hostname: string;
    readonly controlInstanceId: string;
    readonly claimId: string;
    readonly state: "pending" | "verified" | "disabled";
    readonly revision: number;
}

export interface HostingZonePage {
    readonly items: readonly HostingZone[];
    readonly nextCursor: string | null;
}

export interface HostingZoneStore {
    getZone(hostname: string): Promise<HostingZone | null>;
    claimZone(candidate: HostingZone): Promise<HostingZone>;
    replaceZone(expectedRevision: number, candidate: HostingZone): Promise<HostingZone>;
    listZones(input: { controlInstanceId: string; after: string | null; limit: number }): Promise<HostingZonePage>;
    findVerifiedZone(controlInstanceId: string, hostnames: readonly string[]): Promise<HostingZone | null>;
}
