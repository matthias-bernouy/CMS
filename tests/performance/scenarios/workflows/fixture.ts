import { assertCondition } from "../queries/types";
import { formsTenant } from "../forms/tenant";
import { draft } from "../../../../packages/features/forms/tests/fixtures";
import type { WorkflowContext } from "./context";
export async function domainSource(context: WorkflowContext) {
    const forms = await formsTenant(context.inventory, context.fresh, "http");
    const formId = crypto.randomUUID();
    await forms.call("forms.create-v2", {
        formId,
        draft,
    });
    await forms.call("forms.publish-v2", { formId, expectedRevision: 1 });
    const source = await context.fresh.fixture(
        "sources.resolve",
        { contractId: "ulvia/cms.forms", eventType: "submission.created" },
        "ulvia/cms.events",
    );
    const selectorJson = JSON.stringify({ formId });
    const resource = await context.fresh.fixture("forms.describe-submission", { selectorJson }, "ulvia/cms.forms");
    return { source, resource, formId, selectorJson, forms };
}
export async function workflowDocument(context: WorkflowContext, trigger = false, failure = false) {
    const source = trigger ? await domainSource(context) : undefined;
    return {
        format: "ulvia-workflow/v1",
        inputSchema: { type: "object", properties: {}, required: [] },
        parametersSchema: { type: "object", properties: {}, required: [] },
        outputSchema: { type: "boolean" },
        entry: "read",
        ...(source
            ? {
                  trigger: {
                      kind: "event",
                      contractId: "ulvia/cms.forms",
                      eventType: "submission.created",
                      filter: { kind: "literal", value: { formId: source.formId } },
                  },
              }
            : {}),
        steps: [
            {
                id: "read",
                kind: "call",
                target: { contractId: "ulvia/cms.content", capabilityId: failure ? "pages.get" : "site.get" },
                input: { kind: "literal", value: failure ? { id: "workflow-missing-page" } : {} },
                next: null,
                onError: {},
            },
        ],
        output: { kind: "literal", value: true },
    };
}
export async function failedRun(context: WorkflowContext, workflowId: string, runId = crypto.randomUUID()) {
    await context.call("runs.start", { runId, workflowId, publishedRevision: 1, inputJson: "{}" });
    for (let attempt = 0; attempt < 200; attempt++) {
        const run = await context.call("runs.get", { runId, includeResult: false });
        if (run.status === "failed") {
            return run;
        }
        await Bun.sleep(50);
    }
    throw new Error("Workflow fixture did not reach its declared failure");
}
export async function eventFixture(context: WorkflowContext) {
    const document = await workflowDocument(context, true);
    const workflowId = crypto.randomUUID();
    await context.call("definitions.create", {
        workflowId,
        definitionJson: JSON.stringify(document),
        parametersJson: "{}",
    });
    await context.call("definitions.publish", { workflowId, expectedRevision: 1 });
    const triggerId = crypto.randomUUID();
    const trigger = await context.call("triggers.create", { triggerId, workflowId, publishedRevision: 1 });
    const sources = await context.fresh.fixture(
        "sources.list",
        { contractId: "ulvia/cms.forms", limit: 100 },
        "ulvia/cms.events",
    );
    assertCondition(Array.isArray(sources.items) && sources.items.length === 1);
    const source = sources.items[0] as Readonly<Record<string, unknown>>;
    const selectorJson = JSON.stringify(document.trigger!.filter.value);
    const resource = await context.fresh.fixture("forms.describe-submission", { selectorJson }, "ulvia/cms.forms");
    const formId = (document.trigger!.filter.value as { formId: string }).formId;
    return {
        event: {
            format: "ulvia-event/v1",
            occurrenceId: crypto.randomUUID(),
            deliveryId: crypto.randomUUID(),
            subscriptionId: triggerId,
            subscriptionRevision: trigger.subscriptionRevision,
            consumerContractId: "ulvia/cms.workflows",
            occurredAt: new Date().toISOString(),
            source: {
                installationId: source.installationId,
                contractId: source.contractId,
                definitionId: source.definitionId,
                eventType: source.eventType,
                version: source.version,
                digest: source.digest,
            },
            schemas: [
                {
                    path: "/answers",
                    resolver: "forms.describe-submission",
                    resourceId: resource.resourceId,
                    version: resource.version,
                    digest: resource.digest,
                },
            ],
            payloadJson: JSON.stringify({
                formId,
                formVersion: 1,
                submissionId: crypto.randomUUID(),
                receivedAt: new Date().toISOString(),
                answers: { consent: true },
            }),
        },
        workflowId,
    };
}
