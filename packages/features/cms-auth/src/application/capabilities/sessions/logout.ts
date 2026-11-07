import { defineCapability } from "cms-auth/application/capabilities/define";
import { capabilityResponse } from "@bernouy/ulvia-sdk";
import { emptyInputSchema, logoutOutputSchema } from "cms-auth/application/schemas/sessions";
import { serviceErrors as errors } from "cms-auth/application/schemas/errors";

export const logout = defineCapability({
    id: "logout",
    description: "Clear the current CMS session.",
    access: "public",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    responseEffects: ["session"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/logout",
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: emptyInputSchema,
    output: logoutOutputSchema,
    errors,
    execute: async ({ services, context }) => {
        await services.authentication.revokeCredential(context.actorCredential);
        return capabilityResponse({ cleared: true }, { type: "session", operation: "clear" });
    },
});
