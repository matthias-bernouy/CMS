import { z } from "@bernouy/ulvia-sdk";
import { defineCapability } from "email/capabilities/define";
import { prepareOutboundEmail } from "email/core/delivery";
import { EmailDeliveryInputError, isEmailDeliveryDisabledError } from "email/core/EmailDeliveryError";
import { sendEmailInputSchema, sendEmailOutputSchema } from "email/schemas/delivery";
import { emailErrorSchema } from "email/schemas/errors";

export const sendEmail = defineCapability({
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
    execute: async ({ input, services, fail }) => {
        try {
            await services.emailer.send(prepareOutboundEmail(input));
            return { sent: true };
        } catch (cause) {
            if (cause instanceof z.ZodError || cause instanceof EmailDeliveryInputError) {
                throw fail("INVALID_INPUT", { message: "Email data or configuration is invalid." }, { cause });
            }
            if (isEmailDeliveryDisabledError(cause)) {
                throw fail("EMAIL_DISABLED", { message: "Email delivery is disabled." }, { cause });
            }
            throw fail("CORE_UNAVAILABLE", { message: "Email delivery is unavailable." }, { cause });
        }
    },
});
