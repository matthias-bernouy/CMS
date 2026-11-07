import { defineOperation } from "@bernouy/ulvia-sdk";
import { sendEmailInputSchema, sendEmailOutputSchema } from "email/schemas/delivery";
import { emailErrorSchema } from "email/schemas/errors";

export const sendEmail = defineOperation({
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
