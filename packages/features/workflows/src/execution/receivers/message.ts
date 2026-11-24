import { inspectWorkflowPlan } from "workflows/definitions/health";
import { WorkflowTriggers } from "workflows/definitions/Triggers";
import { createHash } from "node:crypto";
import { canonicalizeIJson, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { projectSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { validateEventMessage, eventFingerprint } from "@bernouy/cms-gateway/events";
import type { EventMessage } from "@bernouy/cms-gateway/events";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { WorkflowServices } from "workflows/interfaces/services";
import { WorkflowError } from "workflows/core/errors";
import { WorkflowRuns } from "../Runs";
import { workflowConsumedPayload } from "workflows/core/events/usage";
import { workflowAncestry } from "../ancestry";
export async function receiveWorkflowMessage(
    services: WorkflowServices,
    input: EventMessage,
    context: ProviderCapabilityInvocationContext,
) {
    await services.authority.assertEventDelivery(context, input);
    const event = validateEventMessage(input);
    const fingerprint = createHash("sha256").update(canonicalizeIJson(event)).digest("hex");
    const receipt = { deliveryId: event.deliveryId, accepted: true as const };
    const existing = await services.store.eventReceipt(event.deliveryId);
    if (existing) {
        if (existing !== fingerprint) {
            throw new WorkflowError("DELIVERY_CONFLICT");
        }
        return receipt;
    }
    const trigger = await services.store.trigger(event.subscriptionId, event.subscriptionRevision);
    if (!trigger) {
        throw new WorkflowError(
            (await services.store.triggerBySubscription(event.subscriptionId)) ? "CORE_UNAVAILABLE" : "FORBIDDEN",
        );
    }
    const head = await services.store.trigger(trigger.id);
    if (!head) {
        throw new WorkflowError("FORBIDDEN");
    }
    if (head.state !== "active" || head.subscriptionRevision !== trigger.subscriptionRevision) {
        await services.store.acceptEvent(event, fingerprint, null);
        return receipt;
    }
    const plan = await services.store.plan(trigger.workflowId, trigger.workflowRevision);
    if (!plan) {
        await services.store.acceptEvent(event, fingerprint, null);
        return receipt;
    }
    const diagnostic = await inspectWorkflowPlan(plan, services.contracts);
    if (diagnostic) {
        await new WorkflowTriggers(services).suspend(head, diagnostic);
        await services.store.acceptEvent(event, fingerprint, null);
        return receipt;
    }
    const definition = plan.eventTrigger;
    if (
        !definition ||
        event.source.definitionId !== definition.id ||
        event.source.digest !== definition.digest ||
        event.source.installationId !== definition.owner.installationId ||
        event.source.contractId !== definition.owner.namespace ||
        event.source.eventType !== definition.eventType ||
        event.source.version !== definition.version
    ) {
        throw new WorkflowError("INVALID_INPUT");
    }
    const parent = [
        ...(event.causation ?? []),
        eventFingerprint({
            owner: {
                siteId: context.siteId,
                installationId: context.connectionId,
                consumerContractId: event.consumerContractId,
            },
            id: event.subscriptionId,
        }),
    ];
    if (!workflowAncestry(trigger.workflowId, trigger.workflowRevision, parent)) {
        await services.store.acceptEvent(event, fingerprint, null);
        return receipt;
    }
    const bindings = plan.eventSchemas ?? [];
    if (
        (event.schemas?.length ?? 0) !== bindings.length ||
        bindings.some(
            ({ path, declaration, descriptor }) =>
                !event.schemas?.some(
                    (item) =>
                        item.path === path &&
                        item.resolver === declaration.resolver &&
                        item.resourceId === descriptor.resourceId,
                ),
        )
    ) {
        throw new WorkflowError("INVALID_INPUT");
    }
    const schema = workflowConsumedPayload(plan);
    if (event.payloadJson !== undefined && !schema) {
        throw new WorkflowError("INVALID_INPUT");
    }
    let data =
        event.payloadJson === undefined
            ? undefined
            : parseStrictJson(new TextEncoder().encode(event.payloadJson), 1048576, 32);
    let value: unknown;
    try {
        if (data !== undefined && schema) {
            data = projectSchemaValue(schema, data);
        }
        const { payloadJson: _payload, ...metadata } = event;
        value = { ...metadata, ...(data === undefined ? {} : { data }) };
        const triggerSchema = plan.triggerSchema;
        if (!triggerSchema || triggerSchema.type !== "object") {
            throw new WorkflowError("INVALID_STATE");
        }
        validateSchemaValue(
            { ...triggerSchema, properties: { ...triggerSchema.properties, ...(schema ? { data: schema } : {}) } },
            value,
        );
    } catch {
        await new WorkflowTriggers(services).suspend(head, { code: "EVENT_SCHEMA_CHANGED", path: "trigger.data" });
        await services.store.acceptEvent(event, fingerprint, null);
        return receipt;
    }
    const run = await new WorkflowRuns(services).prepare(
        `event:${createHash("sha256").update(event.deliveryId).digest("hex")}`,
        trigger.workflowId,
        trigger.workflowRevision,
        trigger.administratorId,
        {},
        value,
        parent,
    );
    await services.store.acceptEvent(event, fingerprint, run);
    return receipt;
}
