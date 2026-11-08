import { defineCapability } from "content/application/capabilities/define";
import { pageIdInputSchema } from "content/application/schemas/pages/inputs";
import { pageEditingDetailsSchema } from "content/application/schemas/pages/outputs";
import { lookupErrors as errors } from "content/application/schemas/errors";
import { getCmsPage } from "content/pages/core/contracts/pageDetails";
export const pagesGet = defineCapability({
    id: "pages.get",
    description: "Read one complete editable Page by stable identity.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/pages/get",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_pages_get",
                description:
                    "Read a Page, its editable content and current revision. Use that revision for subsequent mutations.",
            },
        },
    ],
    docs: ["overview.md", "pages/create-and-publish.md", "pages/verify.md", "pages/revisions.md"],
    input: pageIdInputSchema,
    output: pageEditingDetailsSchema,
    errors,
    execute: ({ services, input }) => getCmsPage(services.repo, input),
});
