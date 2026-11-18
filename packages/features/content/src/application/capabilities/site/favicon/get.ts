import { defineCapability } from "content/application/capabilities/define";
import { emptyInputSchema } from "content/application/schemas/common";
import { faviconSettingsSchema } from "content/application/schemas/site";
import { serviceErrors as errors } from "content/application/schemas/errors";
import { readSystemSnapshot } from "content/settings/core/readSystemSnapshot";
export const siteFaviconGet = defineCapability({
    id: "site.favicon.get",
    description:
        "Read the site's configured favicon URL and current settings revision. An empty URL selects the default favicon.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/site/favicon",
            input: {},
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
                name: "content_site_favicon_get",
                description: "Read this instance's favicon and settings revision before replacement or removal.",
            },
        },
    ],
    docs: ["site/favicon.md", "overview.md"],
    input: emptyInputSchema,
    output: faviconSettingsSchema,
    errors,
    execute: async ({ services }) => {
        const { system, revision } = await readSystemSnapshot(services.repo);
        return { revision, favicon: system.site.favicon };
    },
});
