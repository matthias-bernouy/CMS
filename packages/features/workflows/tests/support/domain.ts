import { WorkflowDefinitions, WorkflowTriggers } from "@bernouy/workflows";
import type { EventDefinition } from "@bernouy/cms-events";
import type { EventMessage } from "@bernouy/cms-gateway/events";
import { definition, fixture } from "./fixture";
export const eventDefinition: EventDefinition = {
    id: "a".repeat(64),
    digest: `sha256:${"b".repeat(64)}`,
    owner: { siteId: "site-a", installationId: "payments", namespace: "test/payments" },
    declaringContract: { contractId: "test/payments", version: "1.0.0", digest: `sha256:${"b".repeat(64)}` },
    eventType: "payment.succeeded",
    version: "1.0.0",
    retired: false,
    sensitive: false,
    createdAt: "2026-11-23T10:00:00Z",
    schema: {
        type: "object",
        properties: {
            id: { type: "string", minLength: 1, maxLength: 32 },
            secret: { type: "string", sensitive: true },
        },
        required: ["id", "secret"],
    },
};
export const document = {
    ...definition,
    inputSchema: { type: "object", properties: {}, required: [] },
    trigger: { kind: "event", contractId: "test/payments", eventType: "payment.succeeded" },
    entry: "has-data",
    steps: [
        {
            id: "has-data",
            kind: "condition",
            test: { kind: "exists", value: { kind: "trigger", path: "/data" } },
            then: "read",
            otherwise: null,
        },
        {
            ...definition.steps[0],
            next: null,
            input: { kind: "object", fields: { id: { kind: "trigger", path: "/data/id" } } },
        },
    ],
};
export const context = {
    requestId: "request",
    siteId: "site-a",
    providerId: "provider",
    connectionId: "provider",
    contractVersion: "1.0.0",
    systemServiceId: "cms-events-delivery",
};
export function message(): EventMessage {
    return {
        format: "ulvia-event/v1",
        occurrenceId: "event",
        deliveryId: "delivery",
        subscriptionId: "trigger",
        subscriptionRevision: 1,
        consumerContractId: "ulvia/cms.workflows",
        occurredAt: "2026-11-23T10:00:00Z",
        source: {
            installationId: eventDefinition.owner.installationId,
            contractId: eventDefinition.owner.namespace,
            definitionId: eventDefinition.id,
            eventType: eventDefinition.eventType,
            version: eventDefinition.version,
            digest: eventDefinition.digest,
        },
        payloadJson: '{"id":"order"}',
    };
}
export function domainFixture() {
    const f = fixture();
    const source = structuredClone(eventDefinition);
    const removed: string[] = [];
    const disabled: string[] = [];
    f.services.contracts.resolveEvent = async () => structuredClone(source);
    f.services.domainSubscriptions.remove = async (id) => {
        removed.push(id);
    };
    f.services.domainSubscriptions.disable = async (id) => {
        disabled.push(id);
        return { revision: 2 };
    };
    return {
        ...f,
        source,
        removed,
        disabled,
        definitions: new WorkflowDefinitions(f.services),
        triggers: new WorkflowTriggers(f.services),
    };
}
