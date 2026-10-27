import type { GatewayRoute, GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { ProviderReportReader } from "@bernouy/cms-repository/providers/management";

/** Refresh approved remote observations on demand; reports never change approval or selection. */
export class RefreshingProviderRoutes implements GatewayRouteResolver {
    private readonly flights = new Map<string, Promise<void>>();
    private readonly next = new Map<string, number>();
    private readonly warmups = new Map<string, { nextAt: number; pending?: Promise<void> }>();
    constructor(
        private readonly base: GatewayRouteResolver,
        private readonly options: {
            installations: ProviderInstallationStore;
            resolveSecret(reference: string): Promise<string | null | undefined>;
            readReport: ProviderReportReader;
            reportFailure(installationId: string, error: unknown): void;
            now?: () => number;
        },
    ) {}
    /** Warm-up is advisory; live capability resolution still reads current authority on every call. */
    warm(siteId: string, contractId: string): Promise<void> {
        const key = `${siteId}/${contractId}`;
        const now = (this.options.now ?? Date.now)();
        let entry = this.warmups.get(key);
        if (entry?.pending) {
            return entry.pending;
        }
        if (entry && now < entry.nextAt) {
            return Promise.resolve();
        }
        if (!entry) {
            if (this.warmups.size >= 512) {
                this.warmups.delete(this.warmups.keys().next().value!);
            }
            entry = { nextAt: 0 };
            this.warmups.set(key, entry);
        }
        const state = entry;
        state.pending = this.resolve(siteId, contractId)
            .then((route) => {
                const observedAt = Date.parse(route?.installation.observation?.observedAt ?? "");
                const now = (this.options.now ?? Date.now)();
                state.nextAt =
                    Number.isFinite(observedAt) && observedAt <= now && now - observedAt < 30_000
                        ? observedAt + 30_000
                        : now + 5_000;
            })
            .finally(() => {
                state.pending = undefined;
            });
        return state.pending;
    }
    async resolve(siteId: string, contractId: string) {
        const route = await this.base.resolve(siteId, contractId);
        if (!route || route.installation.installation.status !== "enabled") {
            return route;
        }
        const now = (this.options.now ?? Date.now)();
        const age = now - Date.parse(route.installation.observation?.observedAt ?? "");
        if (Number.isFinite(age) && age >= 0 && age < 30_000) {
            return route;
        }
        const key = `${siteId}/${route.installation.installation.id}`;
        const pending = this.flights.get(key);
        if (pending) {
            await pending;
            return this.base.resolve(siteId, contractId);
        }
        if (now < (this.next.get(key) ?? 0)) {
            return route;
        }
        if (!this.next.has(key) && this.next.size >= 512) {
            this.next.delete(this.next.keys().next().value!);
        }
        const flight = this.refresh(route, key, now).finally(() => {
            this.flights.delete(key);
        });
        this.flights.set(key, flight);
        await flight;
        return this.base.resolve(siteId, contractId);
    }
    isCurrent(route: GatewayRoute) {
        return this.base.isCurrent(route);
    }
    private async refresh(route: GatewayRoute, key: string, now: number) {
        this.next.set(key, now + 5000);
        try {
            const source = route.installation.installation;
            const token = await this.options.resolveSecret(source.providerTokenRef);
            if (!token) {
                throw new Error("Provider report credential unavailable");
            }
            const report = await this.options.readReport(source.endpoint, token);
            await this.options.installations.recordObservation(
                { siteId: source.siteId, installationId: source.id },
                route.installation.revision,
                report,
            );
            this.next.delete(key);
        } catch (error) {
            this.options.reportFailure(route.installation.installation.id, error);
        }
    }
}
