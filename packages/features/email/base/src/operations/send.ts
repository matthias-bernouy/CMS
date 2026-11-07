import { defineOperation } from "@bernouy/ulvia-sdk";
import { sendEmailInputSchema, sendEmailOutputSchema } from "email/schemas/delivery";
import { emailErrorSchema } from "email/schemas/errors";

export const sendEmail = defineOperation({
    id: "emailer.send",
    access: "admin",
    behavior: { effect: "command", idempotency: "keyed", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/send",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, EMAIL_DISABLED: 409, CORE_UNAVAILABLE: 503 },
            },
        },
    ],

    description: "Deliver one fully composed outbound email through the configured transport.",
    input: sendEmailInputSchema,
    output: sendEmailOutputSchema,
    errors: {
        INVALID_INPUT: { retryable: false, output: emailErrorSchema },
        EMAIL_DISABLED: { retryable: false, output: emailErrorSchema },
        CORE_UNAVAILABLE: { retryable: true, output: emailErrorSchema },
    },
    docs: ["overview.md"],
});
