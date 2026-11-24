import { resolveContract } from "@bernouy/ulvia-contracts";
import { EventDefinitions } from "@bernouy/cms-events";
import type { EventServices } from "@bernouy/cms-events";
import type { ProviderStores } from "../../stores/providerStores";
import type { createProviderGateway } from "../../gateway/createProviderGateway";

/** Only admitted selected source metadata is projected; publication and reader ownership remain unchanged. */
export function eventSourceInventory(
    stores: ProviderStores,
    gateway: Awaited<ReturnType<typeof createProviderGateway>>,
    services: EventServices,
) {
    let completed: number | undefined;
    let reading: number | undefined;
    let cursor: string | undefined;
    let unavailable = false;
    return async (limit: number) => {
        const selected = await gateway.selections.get(gateway.siteId);
        if (!selected || selected.revision === completed) {
            return;
        }
        if (reading !== selected.revision) {
            cursor = undefined;
            unavailable = false;
            reading = selected.revision;
        }
        let count = 0;
        const pins = [...selected.plan.selections].sort((a, b) => (a.contractId < b.contractId ? -1 : 1));
        for (const pin of pins) {
            const route = await gateway.routes.resolve(gateway.siteId, pin.contractId);
            if (!route) {
                unavailable = true;
                continue;
            }
            const contract = await resolveContract(stores.releases, route.requestedRelease.admission);
            const key = (event: (typeof contract.events)[number]) =>
                `${pin.contractId}\0${event.owner.contractId}\0${event.definition.id}`;
            const events = [...contract.events].sort((a, b) => (key(a) < key(b) ? -1 : 1));
            for (const event of events) {
                const id = key(event);
                if (cursor !== undefined && id <= cursor) {
                    continue;
                }
                await new EventDefinitions(services).resolve(
                    { siteId: gateway.siteId, installationId: pin.installationId, namespace: event.owner.contractId },
                    event.definition.id,
                );
                cursor = id;
                if (++count === limit) {
                    return;
                }
            }
        }
        cursor = undefined;
        if (!unavailable) {
            completed = selected.revision;
        }
        // A complete second sweep discovers sources that recovered before this partial pass finished.
        unavailable = false;
    };
}
