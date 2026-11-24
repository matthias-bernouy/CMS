import { z, contractString, schemaDescriptorSchema } from "@bernouy/ulvia-sdk";
import { gatewayDispatchPrepareInputSchema } from "../invocation/gateway.dispatch.prepare";
const id = contractString({ minLength: 1, maxLength: 160 });
export const gatewaySchemaSealInputSchema = z.strictObject({
    actor: gatewayDispatchPrepareInputSchema.shape.actor,
    target: z.strictObject({
        installationId: id,
        contractId: contractString({ minLength: 1, maxLength: 193 }),
        capabilityId: id,
        version: contractString({ minLength: 5, maxLength: 64 }),
        digest: contractString({ minLength: 71, maxLength: 71 }),
        endpoint: contractString({ minLength: 1, maxLength: 2048 }),
        accountId: id,
        instanceId: id,
    }),
    descriptor: schemaDescriptorSchema,
});
