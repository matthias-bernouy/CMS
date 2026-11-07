import { defineCapability } from "cms-content/application/capabilities/define";
import { themeTokenSaveInputSchema, themeTokenValueSchema } from "cms-content/application/schemas/theme";
import { themeActivateErrors as errors } from "cms-content/application/schemas/errors";
import { mutateToken } from "cms-content/application/core/capabilities/theme";
export const themeTokenSave = defineCapability({
    id: "theme.token.save",
    description: "Set one token override on one site theme profile and mode.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/theme/token",
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
                name: "content_theme_token_save",
                description:
                    "Override one theme token on this site using the current expectedRevision. The collection release is unchanged.",
            },
        },
    ],
    docs: ["overview.md"],
    input: themeTokenSaveInputSchema,
    output: themeTokenValueSchema,
    errors,
    execute: async ({ input, services, context }) => mutateToken(services, context.siteId, input, false),
});
