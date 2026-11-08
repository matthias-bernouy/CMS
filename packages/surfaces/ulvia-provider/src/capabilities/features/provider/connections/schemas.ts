import { z, contractString } from "@bernouy/ulvia-sdk";

export const configureConnectionInputSchema = z.strictObject({
    connectionId: contractString({ maxLength: 128 }),
    cmsUrl: contractString({ maxLength: 2048 }),
    token: contractString({ maxLength: 4096, sensitive: true }),
    generation: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
});
export const configuredConnectionSchema = z.strictObject({
    connectionId: contractString({ maxLength: 128 }),
    configured: z.boolean(),
});
const messageSchema = z.strictObject({ message: contractString({ minLength: 1, maxLength: 2048 }) });
export const connectionErrors = {
    INVALID_INPUT: { retryable: false, output: messageSchema },
    FORBIDDEN: { retryable: false, output: messageSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageSchema },
    REVISION_CONFLICT: { retryable: false, output: messageSchema },
};
