import { defineCapability } from "cms-content/application/capabilities/define";
import { themeGetInputSchema, themeGetOutputSchema } from "cms-content/application/schemas/theme";
import { serviceErrors as errors } from "cms-content/application/schemas/errors";
import { readTheme } from "cms-content/application/core/capabilities/theme";
import { projectThemeWorkspace } from "cms-content/application/core/capabilities/themeProjection";
export const themeGet = defineCapability({
    id: "theme.get",
    description: "Read a filtered collection theme workspace with resolved profile values.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/theme",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_theme_get",
                description: "Read an installed collection’s theme, available modes, tokens and current site values.",
            },
        },
    ],
    docs: ["overview.md"],
    input: themeGetInputSchema,
    output: themeGetOutputSchema,
    errors,
    execute: async ({ input, services, context }) => {
        const { revision, theme } = await readTheme(services, context.siteId);
        return projectThemeWorkspace(theme, revision, input);
    },
});
