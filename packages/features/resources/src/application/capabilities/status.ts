import { defineCapability, resourceBindings } from "./policy";
import { initializationErrors, emptySchema } from "resources/application/schemas/common";
import { initializationStatusSchema } from "resources/application/schemas/status";
import { resourceInitialization, resourceAdministrator } from "resources/application/core/authority";
import { resourceStatus } from "resources/application/core/status";
export const initializationStatus = defineCapability({
    id: "initialization.status",
    access: "admin",
    description: "Read durable resource initialization progress and its current background operation.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: emptySchema,
    output: initializationStatusSchema,
    errors: initializationErrors,
    bindings: resourceBindings("status"),
    docs: ["initialization.md"],
    execute: async ({ services, context }) => {
        const actorId = await resourceAdministrator(services, context);
        const service = resourceInitialization(services, context);
        const state = await service.status(actorId);
        const entry = await service.entry();
        const operation = await services.resources.operation(context.siteId, context.invocation!.contractId);
        return resourceStatus(state, entry.pending, operation);
    },
});
