import { z } from "zod";
import { eventMessageSchema } from "@bernouy/cms-gateway/events";
import { contractString } from "ulvia-sdk/schema/adapters";
import type { UlviaStringSchema } from "@bernouy/ulvia-contracts/schema";
function string<const S extends UlviaStringSchema>({ type: _type, ...definition }: S) {
    return contractString(definition);
}
const f = eventMessageSchema.properties;
const s = f.source.properties;
export const eventMessageDeliverySchema = z.strictObject({
    format: string(f.format),
    occurrenceId: string(f.occurrenceId),
    deliveryId: string(f.deliveryId),
    subscriptionId: string(f.subscriptionId),
    subscriptionRevision: z.int().min(1),
    consumerContractId: string(f.consumerContractId),
    occurredAt: string(f.occurredAt),
    source: z.strictObject({
        contractId: string(s.contractId),
        eventType: string(s.eventType),
        version: string(s.version),
        digest: string(s.digest),
        installationId: string(s.installationId),
        definitionId: string(s.definitionId),
    }),
    initiator: z
        .strictObject({
            kind: string(f.initiator.properties.kind),
            reference: string(f.initiator.properties.reference),
        })
        .optional(),
    schemas: z
        .array(
            z.strictObject({
                path: string(f.schemas.items.properties.path),
                resolver: string(f.schemas.items.properties.resolver),
                resourceId: string(f.schemas.items.properties.resourceId),
                version: string(f.schemas.items.properties.version),
                digest: string(f.schemas.items.properties.digest),
            }),
        )
        .max(32)
        .readonly()
        .optional(),
    payloadJson: string(f.payloadJson).optional(),
    causation: z.array(string(f.causation.items)).max(32).readonly().optional(),
});
