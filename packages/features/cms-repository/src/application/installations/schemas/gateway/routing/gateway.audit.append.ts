import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayAuditAppendInputSchema = z.strictObject({
    event: contractString({ minLength: 1, maxLength: 65536 }),
});

export const gatewayAuditAppendOutputSchema = z.strictObject({
    accepted: z.boolean(),
});
