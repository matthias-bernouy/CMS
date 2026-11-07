import { defineCapability } from "cms-auth/application/capabilities/define";
import { requiredText } from "cms-auth/application/core/access/input";
import { emailInputSchema, sentSchema } from "cms-auth/application/schemas/accounts";
import { inputErrors as errors } from "cms-auth/application/schemas/errors";

export const requestPasswordReset = defineCapability({
    id: "request-password-reset",
    description: "Request a password reset without disclosing account existence.",
    access: "public",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/request-password-reset",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: emailInputSchema,
    output: sentSchema,
    errors,
    execute: async ({ input, services }) =>
        services.accountLifecycle.requestPasswordReset({ email: requiredText(input.email) }),
});
