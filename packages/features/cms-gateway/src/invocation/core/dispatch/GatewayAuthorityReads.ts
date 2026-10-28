import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { GatewayRoute, GatewayRouteResolver } from "cms-gateway/invocation/interfaces/Invocation";

/** Initial metadata reads for one operation. Never pass this context to a final authority fence. */
export class GatewayAuthorityReads {
    #pending = new WeakMap<object, Map<string, Promise<unknown>>>();
    constructor(readonly siteId: string) {}

    selection(store: Pick<ContractSelectionStore, "get">, siteId: string) {
        this.assertSite(siteId);
        return this.read(store, siteId, () => store.get(siteId));
    }

    installation(store: Pick<ProviderInstallationStore, "get">, siteId: string, installationId: string) {
        this.assertSite(siteId);
        return this.read(store, `${siteId}\0${installationId}`, () => store.get({ siteId, installationId }));
    }

    route(
        resolver: GatewayRouteResolver,
        siteId: string,
        contractId: string,
        load: () => Promise<GatewayRoute | null>,
    ) {
        this.assertSite(siteId);
        return this.read(resolver, `${siteId}\0${contractId}`, load);
    }

    clear(): void {
        this.#pending = new WeakMap();
    }

    private assertSite(siteId: string): void {
        if (siteId !== this.siteId) {
            throw new TypeError("Authority reads belong to another site");
        }
    }

    private read<T>(owner: object, key: string, load: () => Promise<T>): Promise<T> {
        let entries = this.#pending.get(owner);
        if (!entries) {
            entries = new Map();
            this.#pending.set(owner, entries);
        }
        const previous = entries.get(key);
        if (previous) {
            return previous as Promise<T>;
        }
        const pending = Promise.resolve().then(load);
        entries.set(key, pending);
        pending.catch(() => {
            if (entries.get(key) === pending) {
                entries.delete(key);
            }
        });
        return pending;
    }
}
