import { defineCapability } from "content/application/capabilities/define";
import { emptyInputSchema } from "content/application/schemas/common";
import { siteSettingsSchema } from "content/application/schemas/site";
import { serviceErrors as errors } from "content/application/schemas/errors";

import { projectSite } from "content/application/core/capabilities/site";
import { readSystemSnapshot } from "content/settings/core/readSystemSnapshot";
export const siteGet = defineCapability({
    id: "site.get",
    description: "Return site identity, availability and system Page references.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/site",
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
                name: "content_site_get",
                description:
                    "Read this instance’s site identity, visibility, 404, forbidden, server-error and login Page references, and current revision before updating them.",
            },
        },
    ],
    docs: ["site/system-pages.md", "overview.md"],
    input: emptyInputSchema,
    output: siteSettingsSchema,
    errors,
    execute: async ({ services }) => {
        const snapshot = await readSystemSnapshot(services.repo);
        return projectSite(snapshot.system, snapshot.revision);
    },
});
