import { z, capabilitiesFor } from "@bernouy/ulvia-sdk";
import type { WorkflowServices } from "workflows/interfaces/services";
import { WorkflowRuns } from "workflows/execution/Runs";
import { id, json, revision, runSummary, runOutput, pageSchema, command, query, binding } from "./schemas";
import { inputJson, outputJson, runDto } from "./guard";
const define = capabilitiesFor<WorkflowServices>();
export const start = define({
    ...command,
    id: "runs.start",
    bindings: [binding("POST", "/runs/start")],
    input: z.strictObject({ runId: id, workflowId: id, publishedRevision: revision, inputJson: json }),
    output: runSummary,
    execute: async ({ services, context, input }) => {
        const administrator = await services.authority.administrator(context);
        return runDto(
            await new WorkflowRuns(services).start(
                input.runId,
                input.workflowId,
                input.publishedRevision,
                administrator,
                inputJson(input.inputJson),
                await services.authority.callAncestry(context),
            ),
        );
    },
});
export const get = define({
    ...query,
    id: "runs.get",
    bindings: [binding("QUERY", "/runs/get")],
    input: z.strictObject({ runId: id, includeResult: z.boolean() }),
    output: runOutput,
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        const run = await new WorkflowRuns(services).get(input.runId);
        return {
            ...runDto(run),
            steps: Object.entries(run.steps).map(([id, step]) => ({
                id,
                state: step.state,
                attempts: step.attempts,
                ...(step.errorCode ? { errorCode: step.errorCode } : {}),
                ...(step.operationId ? { operationId: step.operationId } : {}),
            })),
            ...(input.includeResult && run.resultRef
                ? { resultJson: outputJson(await services.values.get(run.id, run.resultRef)) }
                : {}),
        };
    },
});
export const list = define({
    ...query,
    id: "runs.list",
    bindings: [binding("QUERY", "/runs/list")],
    input: pageSchema,
    output: z.strictObject({ items: z.array(runSummary).max(100).readonly(), nextCursor: id.optional() }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        const page = await services.store.runs(input.cursor, input.limit);
        return { ...page, items: page.items.map(runDto) };
    },
});
export const cancel = define({
    ...command,
    id: "runs.cancel",
    bindings: [binding("POST", "/runs/cancel")],
    input: z.strictObject({ runId: id, expectedRevision: revision }),
    output: z.strictObject({ cancelled: z.boolean() }),
    execute: async ({ services, context, input }) => {
        await services.authority.administrator(context);
        await new WorkflowRuns(services).cancel(input.runId, input.expectedRevision);
        return { cancelled: true };
    },
});
export const resume = define({
    ...command,
    id: "runs.resume",
    bindings: [binding("POST", "/runs/resume")],
    input: z.strictObject({
        runId: id,
        expectedRevision: revision,
        mode: z.enum(["retry", "resolve"]),
        resolutionJson: json.optional(),
    }),
    output: runSummary,
    execute: async ({ services, context, input }) => {
        const administrator = await services.authority.administrator(context);
        return runDto(
            await new WorkflowRuns(services).resume(
                input.runId,
                input.expectedRevision,
                administrator,
                input.mode,
                input.resolutionJson === undefined ? undefined : inputJson(input.resolutionJson),
            ),
        );
    },
});
