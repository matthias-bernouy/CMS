import { defineCapability } from "cms-content/application/capabilities/define";
import { pagesUpdateInputSchema } from "cms-content/application/schemas/pages/inputs";
import { pageDetailsSchema } from "cms-content/application/schemas/pages/outputs";
import { pagesUpdateSeoErrors as errors } from "cms-content/application/schemas/errors";
import { updateCmsPage } from "cms-content/pages/core/contracts/mutatePage";
export const pagesUpdate = defineCapability({
    id: "pages.update",
    description: "Update Page content and metadata with optimistic revision control.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/pages/update",
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
                name: "content_pages_update",
                description:
                    "Update Page fields using the current expectedRevision. For redesigns, read the Page design and rendered review guides. Reread after a revision conflict.",
            },
        },
    ],
    docs: [
        "overview.md",
        "pages/create-and-publish.md",
        "pages/verify.md",
        "pages/revisions.md",
        "pages/design.md",
        "pages/design-review.md",
    ],
    input: pagesUpdateInputSchema,
    output: pageDetailsSchema,
    errors,
    execute: ({ services, input }) => updateCmsPage(services.repo, input),
});
