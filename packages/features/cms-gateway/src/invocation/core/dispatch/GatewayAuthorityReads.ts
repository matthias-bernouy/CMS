import type { ProviderExecutionStateReader } from "@bernouy/cms-repository/providers/selections";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { GatewayRoute, GatewayRouteResolver } from "cms-gateway/invocation/interfaces/Invocation";

/** Initial metadata reads for one operation. Never pass this context to a final authority fence. */
export class GatewayAuthorityReads {
    #pending = new WeakMap<object, Map<string, Promise<unknown>>>();
    constructor(readonly siteId: string) {}

    static async capture(
        siteId: string,
        selections: Pick<ContractSelectionStore, "get">,
        installations: Pick<ProviderInstallationStore, "get">,
        state: ProviderExecutionStateReader,
        installationIds: readonly string[],
    ): Promise<GatewayAuthorityReads> {
        const captured = await state.read(siteId, installationIds);
        const reads = new GatewayAuthorityReads(siteId);
        reads.read(selections, siteId, () => Promise.resolve(captured.selections));
        for (const installationId of installationIds) {
            const record = captured.installations.find((item) => item.installation.id === installationId) ?? null;
            if (record && record.installation.siteId !== siteId) {
                throw new TypeError("Captured installation belongs to another site");
            }
            reads.read(installations, `${siteId}\0${installationId}`, () => Promise.resolve(record));
        }
        if (captured.selections && captured.selections.siteId !== siteId) {
            throw new TypeError("Captured selection belongs to another site");
        }
        return reads;
    }

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
