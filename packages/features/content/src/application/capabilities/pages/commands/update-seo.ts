import { defineCapability } from "content/application/capabilities/define";
import { pagesUpdateSeoInputSchema } from "content/application/schemas/pages/inputs";
import { pageSeoDetailsSchema } from "content/application/schemas/pages/outputs";
import { pagesUpdateSeoErrors as errors } from "content/application/schemas/errors";
import { updateCmsPageSeo } from "content/pages/core/contracts/presentation";
export const pagesUpdateSeo = defineCapability({
    id: "pages.update-seo",
    description: "Update localized Page search metadata with optimistic revision control.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/pages/update-seo",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    INVALID_PAGE: 422,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_pages_update_seo",
                description:
                    "Update a Page’s title or description for one language using its current expectedRevision.",
            },
        },
    ],
    docs: ["overview.md", "pages/create-and-publish.md", "pages/verify.md", "pages/revisions.md"],
    input: pagesUpdateSeoInputSchema,
    output: pageSeoDetailsSchema,
    errors,
    execute: ({ services, input }) => updateCmsPageSeo(services.repo, input),
});
