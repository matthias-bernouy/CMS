import type { GatewayRoute, GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { GatewayCommandAuditEvent, GatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import type { ProviderIdentityScope, ProviderIdentityService } from "@bernouy/cms-gateway/identity";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type { ControlProviderClient } from "./ControlProviderClient";

export class ControlGatewayRouteResolver implements GatewayRouteResolver {
    constructor(private readonly control: ControlProviderClient) {}

    async resolve(siteId: string, contractId: string): Promise<GatewayRoute | null> {
        const snapshot = await this.control.getGatewayRoute(contractId);
        if (snapshot === null) {
            return null;
        }
        return parseRoute(snapshot, siteId, contractId);
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
        route.selection.contractId !== contractId ||
        !route.release ||
        !route.manifest ||
        !route.installation
    ) {
        throw new TypeError("Installations Provider Gateway route does not match the requested selection");
    }
    return route as GatewayRoute;
}
