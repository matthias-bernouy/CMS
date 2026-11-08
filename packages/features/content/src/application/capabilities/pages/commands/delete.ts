import { defineCapability } from "content/application/capabilities/define";
import { pageRevisionInputSchema } from "content/application/schemas/pages/inputs";
import { pagesDeleteOutputSchema } from "content/application/schemas/pages/outputs";
import { pagesDeleteErrors as errors } from "content/application/schemas/errors";
import { deleteCmsPage } from "content/pages/core/contracts/mutatePage";
export const pagesDelete = defineCapability({
    id: "pages.delete",
    description: "Delete one Page with optimistic revision control.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/pages/delete",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    CORE_UNAVAILABLE: 503,
                    PAGE_REFERENCED: 409,
                    INVALID_PAGE: 422,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_pages_delete",
                description:
                    "Delete a Page using its current expectedRevision. Read the Page first to verify the target.",
            },
        },
    ],
    docs: ["overview.md", "pages/create-and-publish.md", "pages/verify.md", "pages/revisions.md"],
    input: pageRevisionInputSchema,
    output: pagesDeleteOutputSchema,
    errors,
    execute: ({ services, input }) => deleteCmsPage(services.repo, input),
});
