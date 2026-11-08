import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const gatewayDelegationCloseInputSchema = z.strictObject({
    context: z.strictObject({
        siteId: contractString({ minLength: 1, maxLength: 128 }),
        ticket: contractString({ minLength: 1, maxLength: 128, sensitive: true }),
        requestId: contractString({ minLength: 1, maxLength: 128 }),
    }),
});
