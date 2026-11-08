import { defineCapability } from "auth/application/capabilities/define";
import { requiredText } from "auth/application/core/access/input";
import { confirmPasswordResetInputSchema, confirmedSchema } from "auth/application/schemas/accounts";
import { inputErrors as errors } from "auth/application/schemas/errors";

export const confirmPasswordReset = defineCapability({
    id: "confirm-password-reset",
    description: "Confirm a password reset with a one-time token.",
    access: "public",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/confirm-password-reset",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: confirmPasswordResetInputSchema,
    output: confirmedSchema,
    errors,
    execute: async ({ input, services }) => {
        await services.accountLifecycle.confirmPasswordReset({
            token: requiredText(input.token),
            password: requiredText(input.password),
        });
        return { confirmed: true };
    },
});
