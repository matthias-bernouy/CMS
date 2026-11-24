import { eventMessageSchema, eventProjectionSchema } from "@bernouy/cms-gateway/events";
import type { UlviaObjectSchema } from "@bernouy/ulvia-contracts/schema";
import { applySchemaBindings } from "@bernouy/ulvia-contracts/resolution";
import type { ResolvedSchemaBinding } from "@bernouy/ulvia-contracts/resolution";
import type { EventDefinition } from "@bernouy/cms-events";
import type { WorkflowDefinition, WorkflowContracts } from "workflows/interfaces/definition";
import { workflowIssue } from "../errors";
export async function resolveWorkflowEvent(
    definition: WorkflowDefinition,
    contracts: WorkflowContracts,
): Promise<EventDefinition | undefined> {
    const source = definition.trigger;
    if (!source) {
        return undefined;
    }
    if (!contracts.resolveEvent) {
        workflowIssue("trigger.eventsUnavailable");
    }
    const event = await contracts.resolveEvent(source.contractId, source.eventType);
    if (event.retired || event.owner.namespace !== source.contractId || event.eventType !== source.eventType) {
        workflowIssue("trigger.eventDefinitionChanged");
    }
    return event;
}
export function domainTriggerSchema(
    definition: EventDefinition,
    bindings: readonly ResolvedSchemaBinding[] = [],
): UlviaObjectSchema {
    const { payloadJson: _payload, ...metadata } = eventMessageSchema.properties;
    const data = definition.sensitive
        ? undefined
        : eventProjectionSchema(applySchemaBindings(definition.schema, bindings, true));
    return {
        type: "object",
        properties: { ...metadata, ...(data ? { data } : {}) },
        required: [...eventMessageSchema.required, ...(bindings.length ? ["schemas"] : [])],
    };
}
