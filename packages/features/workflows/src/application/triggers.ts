import { z, capabilitiesFor } from "@bernouy/ulvia-sdk";
import type { WorkflowServices } from "workflows/interfaces/services";
import { WorkflowTriggers } from "workflows/definitions/Triggers";
import { triggerDto } from "./guard";
import { id, revision, triggerOutput, pageSchema, command, query, binding } from "./schemas";
const define = capabilitiesFor<WorkflowServices>();
const selection = { workflowId: id, publishedRevision: revision };
export const create = define({
    ...command,
    id: "triggers.create",
    bindings: [binding("POST", "/triggers/create")],
    input: z.strictObject({ triggerId: id, ...selection }),
    output: triggerOutput,
    execute: async ({ services, context, input }) => {
        const administrator = await services.authority.administrator(context);
        return triggerDto(
            await new WorkflowTriggers(services).create(
                input.triggerId,
                input.workflowId,
                input.publishedRevision,
                administrator,
            ),
        );
    },
});
export const update = define({
    ...command,
    id: "triggers.update",
    bindings: [binding("POST", "/triggers/update")],
    input: z.strictObject({ triggerId: id, expectedRevision: revision, ...selection }),
    output: triggerOutput,
    execute: async ({ services, context, input }) => {
        const administrator = await services.authority.administrator(context);
        return triggerDto(
            await new WorkflowTriggers(services).update(
                input.triggerId,
                input.expectedRevision,
                input.workflowId,
                input.publishedRevision,
                administrator,
            ),
        );
    },
});
export const list = define({
    ...query,
    id: "triggers.list",
    bindings: [binding("QUERY", "/triggers/list")],
    input: pageSchema,
    output: z.strictObject({ items: z.array(triggerOutput).max(100).readonly(), nextCursor: id.optional() }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        const page = await services.store.triggers(input.cursor, input.limit);
        return { ...page, items: page.items.map(triggerDto) };
    },
});
export const remove = define({
    ...command,
    id: "triggers.delete",
    bindings: [binding("POST", "/triggers/delete")],
    input: z.strictObject({ triggerId: id, expectedRevision: revision }),
    output: z.strictObject({ deleted: z.boolean() }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        await new WorkflowTriggers(services).remove(input.triggerId, input.expectedRevision);
        return { deleted: true };
    },
});

export const revalidate = define({
    ...command,
    id: "triggers.revalidate",
    bindings: [binding("POST", "/triggers/revalidate")],
    input: z.strictObject({ triggerId: id, expectedRevision: revision }),
    output: triggerOutput,
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        return triggerDto(await new WorkflowTriggers(services).revalidate(input.triggerId, input.expectedRevision));
    },
});
