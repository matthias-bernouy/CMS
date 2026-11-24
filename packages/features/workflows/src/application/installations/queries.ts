import { capabilitiesFor, z } from "@bernouy/ulvia-sdk";
import type { WorkflowServices } from "workflows/interfaces/services";
import { WorkflowInstallations } from "workflows/definitions/installations/service";
import { query, binding, id, json, pageSchema, issue } from "../schemas";
import { installation, revisionInput } from "./schemas";
const define = capabilitiesFor<WorkflowServices>();
export const get = define({
    ...query,
    id: "installations.get",
    bindings: [binding("QUERY", "/installations/get")],
    input: z.strictObject({ installationId: id }),
    output: installation.extend({ manifestJson: json, parametersJson: json }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        return new WorkflowInstallations(services).detail(input.installationId);
    },
});
export const list = define({
    ...query,
    id: "installations.list",
    bindings: [binding("QUERY", "/installations/list")],
    input: pageSchema,
    output: z.strictObject({ items: z.array(installation).max(100).readonly(), nextCursor: id.optional() }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        return services.installationStore.list(input.cursor, input.limit);
    },
});
export const validate = define({
    ...query,
    id: "installations.validate",
    bindings: [binding("QUERY", "/installations/validate")],
    input: revisionInput,
    output: z.strictObject({ valid: z.boolean(), issues: z.array(issue).max(1).readonly() }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        const result = await new WorkflowInstallations(services).validate(input.installationId, input.expectedRevision);
        return { valid: result.valid, issues: result.issues };
    },
});
