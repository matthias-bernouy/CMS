import { defineCapability } from "content/application/capabilities/define";
import { faviconUpdateInputSchema, faviconSettingsSchema } from "content/application/schemas/site";
import { localizationUpdateErrors as errors } from "content/application/schemas/errors";
export const siteFaviconUpdate = defineCapability({
    id: "site.favicon.update",
    description:
        "Replace or clear the favicon with optimistic settings revision control. Use a permanent public Files URL. No remote URL is fetched and file visibility is unchanged.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "none" },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/site/favicon",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    REVISION_CONFLICT: 409,
                    UPGRADE_IN_PROGRESS: 423,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_site_favicon_update",
                description:
                    "Set a permanent public favicon URL using expectedRevision. Null or an empty string restores the default. This does not make a private file public.",
            },
        },
    ],
    docs: ["site/favicon.md", "overview.md"],
    input: faviconUpdateInputSchema,
    output: faviconSettingsSchema,
    errors,
    execute: async ({ services, input }) => {
        const favicon = input.favicon ?? "";
        const system = await services.repo.updateSystem({ site: { favicon } } as never, input.expectedRevision);
        return { favicon: system.site.favicon, revision: input.expectedRevision + 1 };
    },
});
