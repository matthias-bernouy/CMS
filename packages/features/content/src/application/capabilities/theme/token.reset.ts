import { defineCapability } from "content/application/capabilities/define";
import { themeTokenResetInputSchema, themeTokenValueSchema } from "content/application/schemas/theme";
import { themeActivateErrors as errors } from "content/application/schemas/errors";
import { mutateToken } from "content/application/core/capabilities/theme";
export const themeTokenReset = defineCapability({
    id: "theme.token.reset",
    description: "Remove one token override from one site theme profile and mode.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/theme/token/reset",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_theme_token_reset",
                description:
                    "Reset one site theme-token override to its collection default using the current expectedRevision.",
            },
        },
    ],
    docs: ["overview.md"],
    input: themeTokenResetInputSchema,
    output: themeTokenValueSchema,
    errors,
    execute: async ({ input, services, context }) => mutateToken(services, context.siteId, input, true),
});
