import { z, capabilitiesFor } from "@bernouy/ulvia-sdk";
import type { EventServices } from "cms-events/interfaces/services";
import { EventDefinitions } from "cms-events/core/definitions";
import { id, hash, json, namespace, cursor, summary, command, query, binding } from "./schemas";
import { definitionDto, definitionSummary } from "./dto";
const define = capabilitiesFor<EventServices>();
export const resolve = define({
    ...command,
    id: "sources.resolve",
    bindings: [binding("POST", "/sources/resolve")],
    input: z.strictObject({ contractId: namespace, eventType: id }),
    output: summary.extend({ schemaJson: json }),
    execute: async ({ services, context, input }) =>
        definitionDto(
            await new EventDefinitions(services).resolve(
                await services.authority.source(context, input.contractId),
                input.eventType,
            ),
        ),
});
export const get = define({
    ...query,
    id: "sources.get",
    bindings: [binding("QUERY", "/sources/get")],
    input: z.strictObject({ definitionId: hash }),
    output: summary.extend({ schemaJson: json }),
    execute: async ({ services, context, input }) => {
        await services.authority.reader(context);
        const api = new EventDefinitions(services);
        const definition = await api.get(input.definitionId, null, true);
        const scope = await services.authority.reader(context, definition.owner.namespace);
        const result = await api.get(input.definitionId, scope, true);
        await services.authority.assertSource(result);
        return definitionDto(result);
    },
});
export const list = define({
    ...query,
    id: "sources.list",
    bindings: [binding("QUERY", "/sources/list")],
    input: z.strictObject({
        contractId: namespace.optional(),
        cursor: cursor.optional(),
        limit: z.int().min(1).max(100),
    }),
    output: z.strictObject({ items: z.array(summary).max(100).readonly(), nextCursor: cursor.optional() }),
    execute: async ({ services, context, input }) => {
        const result = await new EventDefinitions(services).list(
            await services.authority.reader(context, input.contractId),
            input.cursor,
            input.limit,
        );
        return { ...result, items: result.items.map(definitionSummary) };
    },
});
