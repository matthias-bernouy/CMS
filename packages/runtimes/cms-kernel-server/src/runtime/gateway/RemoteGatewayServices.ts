import type { GatewayRoute, GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { GatewayCommandAuditEvent, GatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import type { ProviderIdentityScope, ProviderIdentityService } from "@bernouy/cms-gateway/identity";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type { ControlProviderClient } from "./ControlProviderClient";

export class ControlGatewayRouteResolver implements GatewayRouteResolver {
    readonly #cache = new Map<string, { route: GatewayRoute; expiresAt: number }>();
    readonly #pending = new Map<string, Promise<GatewayRoute | null>>();

    constructor(
        private readonly control: ControlProviderClient,
        private readonly now: () => number = Date.now,
        private readonly cacheDurationMs = 5_000,
    ) {}

    async resolve(siteId: string, contractId: string): Promise<GatewayRoute | null> {
        const cacheKey = routeCacheKey(siteId, contractId);
        const cached = this.#cache.get(cacheKey);
        if (cached && cached.expiresAt > this.now()) {
            return cached.route;
        }
        const pending = this.#pending.get(cacheKey);
        if (pending) {
            return pending;
        }
        // Share concurrent transport-plan reads; dispatch still has a live authorization fence.
        const load = this.control.getGatewayRoute(contractId).then((snapshot) => {
            const route = snapshot === null ? null : parseRoute(snapshot, siteId, contractId);
            if (this.#pending.get(cacheKey) === load && route) {
                this.#cache.set(cacheKey, { route, expiresAt: this.now() + this.cacheDurationMs });
            }
            return route;
        });
        this.#pending.set(cacheKey, load);
        try {
            return await load;
        } finally {
            if (this.#pending.get(cacheKey) === load) {
                this.#pending.delete(cacheKey);
            }
        }
    }

    invalidate(siteId: string, contractId: string): void {
        const key = routeCacheKey(siteId, contractId);
        this.#cache.delete(key);
        this.#pending.delete(key);
    }

    async isCurrent(route: GatewayRoute): Promise<boolean> {
        const snapshot = await this.control.getGatewayRoute(route.selection.contractId);
        if (snapshot === null) {
            return false;
        }
        const current = parseRoute(snapshot, route.selection.siteId, route.selection.contractId);
        return sameSelection(route, current) && sameInstallation(route, current) && readyForSelection(current);
    }
}

function routeCacheKey(siteId: string, contractId: string): string {
    return `${siteId}\u0000${contractId}`;
}

function sameSelection(previous: GatewayRoute, current: GatewayRoute): boolean {
    return (
        current.selection.siteId === previous.selection.siteId &&
        current.selection.contractId === previous.selection.contractId &&
        current.selection.version === previous.selection.version &&
        current.selection.digest === previous.selection.digest &&
        current.selection.installationId === previous.selection.installationId
    );
}

function sameInstallation(previous: GatewayRoute, current: GatewayRoute): boolean {
    return (
        canonicalizeIJson(previous.installation.installation) === canonicalizeIJson(current.installation.installation)
    );
}

function readyForSelection(route: GatewayRoute): boolean {
    return (
        route.installation.observation?.report.implementations.some(
            (item) =>
                item.contractId === route.selection.contractId &&
                item.version === route.selection.version &&
                item.digest === route.selection.digest &&
                item.status === "ready",
        ) ?? false
    );
}

export class ControlProviderIdentityService implements ProviderIdentityService {
    constructor(private readonly control: ControlProviderClient) {}

    getOrCreate(scope: ProviderIdentityScope, cmsSubjectId: string): Promise<string> {
        return this.control.resolveGatewayIdentity(scope.providerId, cmsSubjectId);
    }

    async resolve(): Promise<null> {
        throw new TypeError("Reverse Provider identity resolution is not exposed to the Kernel");
    }
}

export class ControlGatewayAuditStore implements GatewayCommandAuditStore {
    constructor(private readonly control: ControlProviderClient) {}

    append(event: GatewayCommandAuditEvent): Promise<void> {
        return this.control.appendGatewayAudit(event);
    }
}

function parseRoute(snapshot: string, siteId: string, contractId: string): GatewayRoute {
    if (snapshot.length > 1024 * 1024) {
        throw new TypeError("Installations Provider Gateway route is too large");
    }
    const value: unknown = JSON.parse(snapshot);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Installations Provider Gateway route is invalid");
    }
    const route = value as Partial<GatewayRoute>;
    if (
        !route.selection ||
        route.selection.siteId !== siteId ||
        !route.lineage?.some((entry) => entry.contractId === contractId) ||
        !route.release ||
        !route.requestedRelease ||
        !route.manifest ||
        !route.installation
    ) {
        throw new TypeError("Installations Provider Gateway route does not match the requested selection");
    }
    return route as GatewayRoute;
}
