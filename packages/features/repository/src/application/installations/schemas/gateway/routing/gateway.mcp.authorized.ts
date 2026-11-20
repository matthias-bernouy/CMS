import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
import { gatewayMcpResolveInputSchema } from "./gateway.mcp.resolve";

export const gatewayMcpAuthorizedInputSchema = gatewayMcpResolveInputSchema.omit({ contractIds: true }).extend({
    actor: z.strictObject({
        kind: contractString({ enum: ["user", "administrator"], maxLength: 13 }),
        subjectId: contractString({ minLength: 1, maxLength: 256, sensitive: true }),
        authorizationRevision: z.int().min(0).optional(),
    }),
});
