export interface HostedRoute {
    readonly origin: string;
    readonly canonicalOrigin: string;
    readonly instanceId: string;
    readonly domainRevision: number;
    readonly instanceRevision: number;
}
export interface EdgeRoute extends HostedRoute {
    readonly resourceRevision: string;
    readonly hostname: string;
    readonly controlLease: string;
    readonly expiresAt: number;
}
export interface RoutingServices {
    readonly routing: { resolve(hostname: string): Promise<EdgeRoute | null> };
}
