import { defineCapability } from "content/application/capabilities/define";
import { themeActivateInputSchema, themeActivateOutputSchema } from "content/application/schemas/theme";
import { themeActivateErrors as errors } from "content/application/schemas/errors";
import { ContentCapabilityError } from "content/application/core/capabilities/errors";
import { revision, requiredText } from "content/application/core/capabilities/input";
import { readTheme } from "content/application/core/capabilities/theme";
export const themeActivate = defineCapability({
    id: "theme.activate",
    description: "Activate one existing site theme profile.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/theme/activate",
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
                name: "content_theme_activate",
                description: "Activate an installed theme using the current settings expectedRevision.",
            },
        },
    ],
    docs: ["overview.md"],
    input: themeActivateInputSchema,
    output: themeActivateOutputSchema,
    errors,
    execute: async ({ input, services, context }) => {
        const expectedRevision = revision(input.expectedRevision);
        const { theme } = await readTheme(services, context.siteId);
        const themeId = requiredText(input.themeId);
        if (!theme.themes.some(({ id }) => id === themeId)) {
            throw new ContentCapabilityError("NOT_FOUND");
        }
        theme.activeThemeId = themeId;
        const system = await services.repo.updateSystem({ theme }, expectedRevision);
        return {
            revision: expectedRevision + 1,
            activeThemeId: system.theme.activeThemeId,
        };
    },
});
