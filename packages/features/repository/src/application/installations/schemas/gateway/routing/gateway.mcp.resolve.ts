import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { gatewayDefinitionsSchema, knownGatewayDefinitionsSchema } from "./definitions";
export const gatewayMcpResolveInputSchema = z.strictObject({
    contractIds: z
        .array(contractString({ minLength: 1, maxLength: 193 }))
        .max(256)
        .readonly(),
    toolName: contractString({ maxLength: 60 }),
    known: knownGatewayDefinitionsSchema,
});
export const gatewayMcpResolveOutputSchema = z.strictObject({
    found: z.boolean(),
    key: contractString({ maxLength: 80 }),
    definitions: gatewayDefinitionsSchema,
});
