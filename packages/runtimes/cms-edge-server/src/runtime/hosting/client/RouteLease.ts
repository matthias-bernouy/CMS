import type { EdgeRoute } from "@bernouy/hosting/routing";
import type { RoutingClient } from "./RoutingClient";

export function routeContextKey(route: EdgeRoute): string {
    return JSON.stringify([
        route.hostname,
        route.origin,
        route.canonicalOrigin,
        route.instanceId,
        route.domainRevision,
        route.instanceRevision,
    ]);
}

export class RouteLease {
    private renewal?: Promise<void>;
    private readonly key: string;
    constructor(
        private route: EdgeRoute,
        private readonly client: Pick<RoutingClient, "resolve">,
        private readonly now = Date.now,
    ) {
        this.key = routeContextKey(route);
    }
    update(route: EdgeRoute): void {
        if (routeContextKey(route) !== this.key) {
            throw new Error("The hosting route changed");
        }
        if (route.expiresAt > this.route.expiresAt) {
            this.route = route;
        }
    }
    async token(): Promise<string> {
        if (this.route.expiresAt <= this.now() + 5000) {
            return this.refresh();
        }
        return this.route.controlLease;
    }

    /** Drain an in-flight command after its revision/primary election; new ingresses use a new context key. */
    async refresh(): Promise<string> {
        if (!this.renewal) {
            this.renewal = this.client
                .resolve(this.route.hostname)
                .then((current) => {
                    if (
                        !current ||
                        current.hostname !== this.route.hostname ||
                        current.origin !== this.route.origin ||
                        current.instanceId !== this.route.instanceId ||
                        current.domainRevision < this.route.domainRevision ||
                        ((current.domainRevision !== this.route.domainRevision ||
                            current.canonicalOrigin !== this.route.canonicalOrigin) &&
                            current.instanceRevision <= this.route.instanceRevision) ||
                        current.instanceRevision < this.route.instanceRevision
                    ) {
                        throw new Error("The hosting route is no longer active or changed authority");
                    }
                    if (current.expiresAt <= this.now() + 5000) {
                        throw new Error("The renewed hosting lease is too short");
                    }
                    this.route = current;
                })
                .finally(() => {
                    this.renewal = undefined;
                });
        }
        await this.renewal;
        return this.route.controlLease;
    }
}
