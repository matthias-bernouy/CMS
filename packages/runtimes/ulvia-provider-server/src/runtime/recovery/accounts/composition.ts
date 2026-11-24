import { AccountEventWorker } from "@bernouy/auth";
import { EventDefinitions, EventPublications } from "@bernouy/cms-events";
import type { EventServices } from "@bernouy/cms-events";
import type { createProviderGateway } from "../../gateway/createProviderGateway";
import type { ProviderStores } from "../../stores/providerStores";

/** Access remains the owner of facts. No email address, token or actor authority enters these payloads. */
export function composeAccountEvents(options: {
    stores: ProviderStores;
    events: EventServices;
    gateway: Awaited<ReturnType<typeof createProviderGateway>>;
    instanceId: string;
    providerId: string;
}) {
    const { stores, gateway, events } = options;
    return new AccountEventWorker(
        stores.accountEvents,
        {
            async publish(intent) {
                const route = await gateway.routes.resolve(gateway.siteId, "ulvia/cms.access");
                if (
                    !route ||
                    route.installation.installation.accountId !== options.instanceId ||
                    route.installation.installation.providerId !== options.providerId ||
                    !(await gateway.routes.isCurrent(route))
                ) {
                    throw new Error("Access Event source is unavailable");
                }
                const owner = {
                    siteId: gateway.siteId,
                    installationId: route.selection.installationId,
                    namespace: "ulvia/cms.access",
                };
                const definition = await new EventDefinitions(events).resolve(owner, intent.type);
                await new EventPublications(events).publish(
                    owner,
                    definition.id,
                    intent.occurrenceId,
                    intent.payloadJson,
                    intent.causation,
                );
            },
        },
        (eventType, occurrenceId, code) =>
            stores.logger.warn("access.event.publication.failed", { eventType, occurrenceId, code }),
    );
}
