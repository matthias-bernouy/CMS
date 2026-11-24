import { z, capabilitiesFor } from "@bernouy/ulvia-sdk";
import type { EventServices } from "cms-events/interfaces/services";
import { EventSubscriptions } from "cms-events/core/subscriptions";
import { id, namespace, cursor, revision, configuration, subscription, command, query, binding } from "./schemas";
import { subscriptionDto } from "./dto";
const define = capabilitiesFor<EventServices>();
const identity = { consumerContractId: namespace, subscriptionId: id };
export const create = define({
    ...command,
    id: "subscriptions.create",
    bindings: [binding("POST", "/subscriptions/create")],
    input: z.strictObject({ ...identity, configuration }),
    output: subscription,
    execute: async ({ services, context, input }) =>
        subscriptionDto(
            await new EventSubscriptions(services).create(
                await services.authority.subscriber(context, input.consumerContractId),
                input.subscriptionId,
                input.configuration,
            ),
        ),
});
export const get = define({
    ...query,
    id: "subscriptions.get",
    bindings: [binding("QUERY", "/subscriptions/get")],
    input: z.strictObject(identity),
    output: subscription,
    execute: async ({ services, context, input }) =>
        subscriptionDto(
            await new EventSubscriptions(services).get(
                await services.authority.subscriber(context, input.consumerContractId),
                input.subscriptionId,
            ),
        ),
});
export const list = define({
    ...query,
    id: "subscriptions.list",
    bindings: [binding("QUERY", "/subscriptions/list")],
    input: z.strictObject({ consumerContractId: namespace, cursor: cursor.optional(), limit: z.int().min(1).max(100) }),
    output: z.strictObject({ items: z.array(subscription).max(100).readonly(), nextCursor: cursor.optional() }),
    execute: async ({ services, context, input }) => {
        const result = await new EventSubscriptions(services).list(
            await services.authority.subscriber(context, input.consumerContractId),
            input.cursor,
            input.limit,
        );
        return { ...result, items: result.items.map(subscriptionDto) };
    },
});
export const update = define({
    ...command,
    id: "subscriptions.update",
    bindings: [binding("POST", "/subscriptions/update")],
    input: z.strictObject({ ...identity, expectedRevision: revision, configuration }),
    output: subscription,
    execute: async ({ services, context, input }) =>
        subscriptionDto(
            await new EventSubscriptions(services).update(
                await services.authority.subscriber(context, input.consumerContractId),
                input.subscriptionId,
                input.expectedRevision,
                input.configuration,
            ),
        ),
});
export const remove = define({
    ...command,
    id: "subscriptions.delete",
    bindings: [binding("POST", "/subscriptions/delete")],
    input: z.strictObject({ ...identity, expectedRevision: revision }),
    output: z.strictObject({ deleted: z.boolean() }),
    execute: async ({ services, context, input }) => {
        await new EventSubscriptions(services).remove(
            await services.authority.subscriber(context, input.consumerContractId),
            input.subscriptionId,
            input.expectedRevision,
        );
        return { deleted: true };
    },
});
