import { prepareWorkflowInstallation } from "./installations";
import { requireRecord, assertCondition } from "../queries/types";
import { workflowDocument, failedRun, eventFixture } from "./fixture";
import { WORKFLOWS } from "./context";
import type { WorkflowContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";
import type { Variant } from "../../capabilities/types";
export async function prepareWorkflow(
    context: WorkflowContext,
    capability: string,
    binding: string,
    variant: Variant,
): Promise<PreparedSample> {
    if (capability === "events.receive") {
        const { event } = await eventFixture(context);
        const send = await context.machine(capability, WORKFLOWS);
        return {
            send: async () =>
                (
                    await send({ ...event }, (output) =>
                        assertCondition(
                            requireRecord(output).deliveryId === event.deliveryId &&
                                requireRecord(output).accepted === true,
                        ),
                    )
                ).observation,
            verify: async () => {
                await send({ ...event });
                const runs = await context.call("runs.list", { limit: 100 });
                assertCondition(Array.isArray(runs.items) && runs.items.length === 1, "workflow-event-deduplication");
            },
            close: context.fresh.close,
        };
    }
    if (capability.startsWith("installations.")) {
        return prepareWorkflowInstallation(context, capability, binding, variant);
    }
    const trigger = capability.startsWith("triggers.");
    const failure = capability.startsWith("runs.");
    const id = crypto.randomUUID();
    const definitionJson = JSON.stringify(await workflowDocument(context, trigger, failure));
    if (capability !== "definitions.create") {
        await context.call("definitions.create", { workflowId: id, definitionJson, parametersJson: "{}" });
    }
    if (trigger || failure || capability === "definitions.retire") {
        await context.call("definitions.publish", { workflowId: id, expectedRevision: 1 });
    }
    const triggerId = crypto.randomUUID();
    let triggerRow;
    if (trigger && capability !== "triggers.create") {
        triggerRow = await context.call("triggers.create", { triggerId, workflowId: id, publishedRevision: 1 });
    }
    let run;
    if (failure && capability !== "runs.start") {
        run = await failedRun(context, id);
    }
    if ((capability === "runs.list" || capability === "triggers.list") && ["large", "history"].includes(variant)) {
        for (let count = 0; count < (variant === "large" ? 101 : 41); count++) {
            if (trigger) {
                await context.call("triggers.create", {
                    triggerId: crypto.randomUUID(),
                    workflowId: id,
                    publishedRevision: 1,
                });
            } else {
                await failedRun(context, id);
            }
        }
    }
    const inputs: Record<string, Readonly<Record<string, unknown>>> = {
        "definitions.create": { workflowId: id, definitionJson, parametersJson: "{}" },
        "definitions.get": { workflowId: id },
        "definitions.update": { workflowId: id, expectedRevision: 1, definitionJson, parametersJson: "{}" },
        "definitions.validate": { workflowId: id, expectedRevision: 1 },
        "definitions.publish": { workflowId: id, expectedRevision: 1 },
        "definitions.retire": { workflowId: id, publishedRevision: 1 },
        "triggers.create": { triggerId, workflowId: id, publishedRevision: 1 },
        "triggers.update": { triggerId, expectedRevision: triggerRow?.revision, workflowId: id, publishedRevision: 1 },
        "triggers.revalidate": { triggerId, expectedRevision: triggerRow?.revision },
        "triggers.list": { limit: 100 },
        "triggers.delete": { triggerId, expectedRevision: triggerRow?.revision },
        "runs.start": { runId: crypto.randomUUID(), workflowId: id, publishedRevision: 1, inputJson: "{}" },
        "runs.get": { runId: run?.id, includeResult: false },
        "runs.list": { limit: 100 },
        "runs.cancel": { runId: run?.id, expectedRevision: run?.revision },
        "runs.resume": { runId: run?.id, expectedRevision: run?.revision, mode: "retry" },
    };
    let output: Readonly<Record<string, unknown>>;
    return {
        send: async () =>
            (
                await context.fresh.client(WORKFLOWS, capability, binding, inputs[capability]!, (value) => {
                    output = requireRecord(value);
                    if (capability === "definitions.validate") {
                        assertCondition(output.valid === true);
                    }
                    if (capability.endsWith(".list")) {
                        assertCondition(Array.isArray(output.items) && output.items.length > 0);
                    }
                })
            ).observation,
        verify: async () => {
            if (capability.startsWith("definitions.")) {
                const saved = await context.call("definitions.get", { workflowId: id });
                assertCondition(
                    saved.id === id && saved.definitionJson === definitionJson,
                    "workflow-definition-postcondition",
                );
            }
            if (capability === "definitions.retire") {
                assertCondition(output.retired === true);
            }
            if (capability === "runs.cancel") {
                assertCondition(
                    (await context.call("runs.get", { runId: run!.id, includeResult: false })).status === "cancelled",
                );
            }
            if (capability === "runs.get") {
                assertCondition(output.id === run!.id && output.status === "failed");
            }
            if (capability.endsWith(".list") && ["large", "history"].includes(variant)) {
                assertCondition(
                    Array.isArray(output.items) && output.items.length === (variant === "large" ? 100 : 42),
                );
            }
        },
        close: context.fresh.close,
    };
}
