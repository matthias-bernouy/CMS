import { defineCapability } from "auth/application/capabilities/define";
import { requiredText } from "auth/application/core/access/input";
import { confirmEmailVerificationInputSchema, confirmedSchema } from "auth/application/schemas/accounts";
import { inputErrors as errors } from "auth/application/schemas/errors";

export const confirmEmailVerification = defineCapability({
    id: "confirm-email-verification",
    description: "Confirm a local account email with a one-time token.",
    access: "public",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/confirm-email-verification",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: confirmEmailVerificationInputSchema,
    output: confirmedSchema,
    errors,
    execute: async ({ input, services }) => {
        await services.accountLifecycle.confirmEmailVerification({ token: requiredText(input.token) });
        return { confirmed: true };
    },
});
