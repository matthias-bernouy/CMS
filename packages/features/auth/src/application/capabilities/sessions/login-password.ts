import { defineCapability } from "auth/application/capabilities/define";
import { AccessError } from "auth/application/core/access/errors";
import { capabilityResponse } from "@bernouy/ulvia-sdk";
import { loginPasswordInputSchema, loginPasswordOutputSchema } from "auth/application/schemas/sessions";
import { loginPasswordErrors as errors } from "auth/application/schemas/errors";

export const loginPassword = defineCapability({
    id: "login-password",
    description: "Authenticate a local account and establish a CMS session.",
    access: "public",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    responseEffects: ["session"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/login-password",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_CREDENTIALS: 401, RATE_LIMITED: 429, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: loginPasswordInputSchema,
    output: loginPasswordOutputSchema,
    errors,
    execute: async ({ input, services }) => {
        const result = await services.authentication.authenticate(
            typeof input.email === "string" ? input.email : undefined,
            typeof input.password === "string" ? input.password : undefined,
        );
        if (!result.ok) {
            throw new AccessError(result.error === "rate_limited" ? "RATE_LIMITED" : "INVALID_CREDENTIALS");
        }
        const administrator = await services.governance.administrators.get(result.subject.identifier);
        return capabilityResponse(
            {
                subjectId: result.subject.identifier,
                administrator: administrator.enabled,
            },
            {
                type: "session",
                operation: "establish",
                token: result.session.token,
                expiresAt: result.session.expiresAt,
            },
        );
    },
});
