import { defineCapability } from "cms-content/application/capabilities/define";
import { pagesRenameInputSchema } from "cms-content/application/schemas/pages/inputs";
import { pagesRenameOutputSchema } from "cms-content/application/schemas/pages/outputs";
import { pagesRenameErrors as errors } from "cms-content/application/schemas/errors";
import { renameCmsPage } from "cms-content/pages/core/contracts/renamePage";
export const pagesRename = defineCapability({
    id: "pages.rename",
    description: "Rename one Page with optimistic revision control and naturally idempotent retries.",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/pages/rename",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    INVALID_TITLE: 422,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_pages_rename",
                description: "Rename an existing Page using its current expectedRevision.",
            },
        },
    ],
    docs: ["overview.md", "pages/create-and-publish.md", "pages/verify.md", "pages/revisions.md"],
    input: pagesRenameInputSchema,
    output: pagesRenameOutputSchema,
    errors,
    execute: ({ services, input }) => renameCmsPage(services.repo, input),
});
