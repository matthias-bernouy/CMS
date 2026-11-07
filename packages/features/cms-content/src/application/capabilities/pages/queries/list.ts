import { defineCapability } from "cms-content/application/capabilities/define";
import { pagesListInputSchema } from "cms-content/application/schemas/pages/inputs";
import { pagesListOutputSchema } from "cms-content/application/schemas/pages/outputs";
import { serviceErrors as errors } from "cms-content/application/schemas/errors";
import { listCmsPages } from "cms-content/pages/core/contracts/listPages";
export const pagesList = defineCapability({
    id: "pages.list",
    description: "List a bounded, stable Page batch for administration interfaces.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/pages/list",
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
                name: "content_pages_list",
                description:
                    "Find this site’s Pages by text or visibility. Follow the returned cursor and read a Page before changing it.",
            },
        },
    ],
    docs: ["overview.md", "pages/create-and-publish.md", "pages/verify.md", "pages/revisions.md"],
    input: pagesListInputSchema,
    output: pagesListOutputSchema,
    errors,
    execute: ({ services, input }) => listCmsPages(services.repo, input),
});
