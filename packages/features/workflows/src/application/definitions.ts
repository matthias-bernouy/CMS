import { z, capabilitiesFor } from "@bernouy/ulvia-sdk";
import type { WorkflowServices } from "workflows/interfaces/services";
import { WorkflowDefinitions } from "workflows/definitions/Definitions";
import { id, json, revision, draftOutput, issue, command, query, binding } from "./schemas";
const define = capabilitiesFor<WorkflowServices>();
export const create = define({
    ...command,
    id: "definitions.create",
    bindings: [binding("POST", "/definitions/create")],
    input: z.strictObject({ workflowId: id, definitionJson: json, parametersJson: json }),
    output: draftOutput,
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        return new WorkflowDefinitions(services).create(input.workflowId, input.definitionJson, input.parametersJson);
    },
});
export const get = define({
    ...query,
    id: "definitions.get",
    bindings: [binding("QUERY", "/definitions/get")],
    input: z.strictObject({ workflowId: id }),
    output: draftOutput,
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        return new WorkflowDefinitions(services).get(input.workflowId);
    },
});
export const update = define({
    ...command,
    id: "definitions.update",
    bindings: [binding("POST", "/definitions/update")],
    input: z.strictObject({ workflowId: id, expectedRevision: revision, definitionJson: json, parametersJson: json }),
    output: draftOutput,
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        return new WorkflowDefinitions(services).update(
            input.workflowId,
            input.expectedRevision,
            input.definitionJson,
            input.parametersJson,
        );
    },
});
export const validate = define({
    ...query,
    id: "definitions.validate",
    bindings: [binding("QUERY", "/definitions/validate")],
    input: z.strictObject({ workflowId: id, expectedRevision: revision }),
    output: z.strictObject({ valid: z.boolean(), issues: z.array(issue).max(1).readonly() }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        const result = await new WorkflowDefinitions(services).validate(input.workflowId, input.expectedRevision);
        return { valid: result.valid, issues: result.issues };
    },
});
export const publish = define({
    ...command,
    id: "definitions.publish",
    bindings: [binding("POST", "/definitions/publish")],
    input: z.strictObject({ workflowId: id, expectedRevision: revision }),
    output: z.strictObject({ revision, digest: id }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        return new WorkflowDefinitions(services).publish(input.workflowId, input.expectedRevision);
    },
});
export const retire = define({
    ...command,
    id: "definitions.retire",
    bindings: [binding("POST", "/definitions/retire")],
    input: z.strictObject({ workflowId: id, publishedRevision: revision }),
    output: z.strictObject({ retired: z.boolean() }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        return new WorkflowDefinitions(services).retire(input.workflowId, input.publishedRevision);
    },
});
