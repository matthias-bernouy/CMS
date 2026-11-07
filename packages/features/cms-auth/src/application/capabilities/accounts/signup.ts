import { defineCapability } from "cms-auth/application/capabilities/define";
import { requiredText } from "cms-auth/application/core/access/input";
import { signupInputSchema, signupOutputSchema } from "cms-auth/application/schemas/accounts";
import { inputErrors as errors } from "cms-auth/application/schemas/errors";

export const signup = defineCapability({
    id: "signup",
    description: "Create or resume a local CMS account signup.",
    access: "public",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/signup",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: signupInputSchema,
    output: signupOutputSchema,
    errors,
    execute: async ({ input, services }) => {
        await services.accountLifecycle.signup({
            email: requiredText(input.email),
            password: requiredText(input.password),
        });
        return { accepted: true };
    },
});
