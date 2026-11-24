import { expect } from "bun:test";
import { eventMessageSchema, eventProjectionSchema } from "@bernouy/cms-gateway/events";
import type { UlviaObjectSchema } from "@bernouy/ulvia-contracts/schema";
type Call = (path: string, input: unknown, method: "POST" | "QUERY", contractId: string) => Promise<any>;
/** Return the received envelope as a retained run result through the ordinary Workflow API. */
export async function initiatorWorkflow(call: Call, formId: string) {
    const workflowId = `provenance-${crypto.randomUUID()}`;
    const source = await call(
        "/sources/resolve",
        { contractId: "ulvia/cms.forms", eventType: "submission.created" },
        "POST",
        "ulvia/cms.events",
    );
    const declared = await call("/sources/get", { definitionId: source.definitionId }, "QUERY", "ulvia/cms.events");
    const descriptor = await call(
        "/forms/describe-submission",
        { selectorJson: JSON.stringify({ formId }) },
        "QUERY",
        "ulvia/cms.forms",
    );
    const schema = JSON.parse(declared.schemaJson) as UlviaObjectSchema;
    const data = eventProjectionSchema({
        ...schema,
        properties: { ...schema.properties, answers: JSON.parse(descriptor.schemaJson) },
    });
    const { payloadJson: _payload, ...metadata } = eventMessageSchema.properties;
    const definition = {
        format: "ulvia-workflow/v1",
        inputSchema: { type: "object", properties: {}, required: [] },
        parametersSchema: { type: "object", properties: {}, required: [] },
        outputSchema: {
            type: "object",
            properties: { ...metadata, data },
            required: [...eventMessageSchema.required, "schemas"],
        },
        trigger: {
            kind: "event",
            contractId: "ulvia/cms.forms",
            eventType: "submission.created",
            filter: { kind: "literal", value: { formId } },
        },
        entry: "received",
        steps: [
            {
                id: "received",
                kind: "condition",
                test: { kind: "exists", value: { kind: "trigger", path: "/initiator" } },
                then: null,
                otherwise: null,
            },
        ],
        output: { kind: "trigger", path: "" },
    };
    await call(
        "/definitions/create",
        { workflowId, definitionJson: JSON.stringify(definition), parametersJson: "{}" },
        "POST",
        "ulvia/cms.workflows",
    );
    await call("/definitions/publish", { workflowId, expectedRevision: 1 }, "POST", "ulvia/cms.workflows");
    await call(
        "/triggers/create",
        { triggerId: workflowId, workflowId, publishedRevision: 1 },
        "POST",
        "ulvia/cms.workflows",
    );
    return async (submissionId: string) => {
        for (let tries = 0; tries < 300; tries++) {
            const runs = await call("/runs/list", { limit: 100 }, "QUERY", "ulvia/cms.workflows");
            for (const run of runs.items) {
                if (run.workflowId !== workflowId || run.status !== "succeeded") {
                    continue;
                }
                const result = await call(
                    "/runs/get",
                    { runId: run.id, includeResult: true },
                    "QUERY",
                    "ulvia/cms.workflows",
                );
                const event = JSON.parse(result.resultJson);
                if (event.data.submissionId === submissionId) {
                    return event;
                }
            }
            await Bun.sleep(100);
        }
        expect.unreachable("The provenance workflow did not finish");
    };
}
