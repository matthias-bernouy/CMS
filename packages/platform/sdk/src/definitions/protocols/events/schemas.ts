import { z } from "zod";
import { eventReceiptSchema as receipt } from "@bernouy/cms-gateway/events";
import { contractString } from "ulvia-sdk/schema/adapters";
export const eventReceiptSchema = z.strictObject({
    deliveryId: contractString({
        minLength: receipt.properties.deliveryId.minLength,
        maxLength: receipt.properties.deliveryId.maxLength,
    }),
    accepted: z.boolean(),
});
const failureOutput = z.strictObject({ message: contractString({ maxLength: 512 }) });
export const eventReceiverErrors = {
    FORBIDDEN: { retryable: false, output: failureOutput },
    INVALID_INPUT: { retryable: false, output: failureOutput },
    DELIVERY_CONFLICT: { retryable: false, output: failureOutput },
    CORE_UNAVAILABLE: { retryable: true, output: failureOutput },
} as const;
