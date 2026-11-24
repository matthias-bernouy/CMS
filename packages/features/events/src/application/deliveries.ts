import { z, capabilitiesFor } from "@bernouy/ulvia-sdk";
import type { EventServices } from "cms-events/interfaces/services";
import { EventsError } from "cms-events/core/errors";
import { id, namespace, cursor, query, binding } from "./schemas";
const define = capabilitiesFor<EventServices>();
const status = z.strictObject({
    deliveryId: id,
    occurrenceId: id,
    subscriptionId: id,
    subscriptionRevision: z.int().min(1),
    state: z.enum(["pending", "delivered", "cancelled", "failed"]),
    attempts: z.int().min(0),
    nextAttemptAt: z.int().min(0).optional(),
    failureCode: id.optional(),
});
export const list = define({
    ...query,
    id: "deliveries.list",
    bindings: [binding("QUERY", "/deliveries/list")],
    input: z.strictObject({ consumerContractId: namespace, cursor: cursor.optional(), limit: z.int().min(1).max(100) }),
    output: z.strictObject({ items: z.array(status).max(100).readonly(), nextCursor: cursor.optional() }),
    execute: async ({ services, context, input }) => {
        const scope = await services.authority.reader(context, input.consumerContractId);
        if (!scope) {
            throw new EventsError("FORBIDDEN");
        }
        return services.store.deliveryStatuses(
            {
                siteId: scope.siteId,
                installationId: scope.installationId,
                consumerContractId: input.consumerContractId,
            },
            input.cursor,
            input.limit,
            services.now(),
        );
    },
});
