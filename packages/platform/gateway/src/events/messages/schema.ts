import type { UlviaObjectSchema } from "@bernouy/ulvia-contracts/schema";
const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const resource = { type: "string", minLength: 3, maxLength: 225 } as const;
export const eventMessageSchema = {
    type: "object",
    properties: {
        format: { type: "string", enum: ["ulvia-event/v1"], maxLength: 32 },
        occurrenceId: id,
        deliveryId: id,
        subscriptionId: id,
        subscriptionRevision: { type: "integer", minimum: 1 },
        consumerContractId: resource,
        occurredAt: { type: "string", format: "date-time", maxLength: 64 },
        initiator: {
            type: "object",
            properties: {
                kind: { type: "string", enum: ["user", "system", "anonymous"], maxLength: 9 },
                reference: { type: "string", minLength: 1, maxLength: 2048 },
            },
            required: ["kind", "reference"],
        },
        schemas: {
            type: "array",
            maxItems: 32,
            items: {
                type: "object",
                properties: {
                    path: { type: "string", maxLength: 2048 },
                    resolver: id,
                    resourceId: id,
                    version: id,
                    digest: { type: "string", minLength: 71, maxLength: 71 },
                },
                required: ["path", "resolver", "resourceId", "version", "digest"],
            },
        },
        payloadJson: { type: "string", maxLength: 1048576 },
        causation: { type: "array", items: { type: "string", minLength: 64, maxLength: 64 }, maxItems: 32 },
        source: {
            type: "object",
            properties: {
                contractId: resource,
                eventType: id,
                version: id,
                digest: { type: "string", minLength: 71, maxLength: 71 },
                installationId: id,
                definitionId: { type: "string", minLength: 64, maxLength: 64 },
            },
            required: ["contractId", "eventType", "version", "digest", "installationId", "definitionId"],
        },
    },
    required: [
        "format",
        "occurrenceId",
        "deliveryId",
        "subscriptionId",
        "subscriptionRevision",
        "consumerContractId",
        "occurredAt",
        "source",
    ],
} as const satisfies UlviaObjectSchema;
export const eventReceiptSchema = {
    type: "object",
    properties: { deliveryId: id, accepted: { type: "boolean" } },
    required: ["deliveryId", "accepted"],
} as const satisfies UlviaObjectSchema;
