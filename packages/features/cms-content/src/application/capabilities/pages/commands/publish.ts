import { defineCapability } from "cms-content/application/capabilities/define";
import { pagesPublishInputSchema } from "cms-content/application/schemas/pages/inputs";
import { pageDetailsSchema } from "cms-content/application/schemas/pages/outputs";
import { pagesPublishErrors as errors } from "cms-content/application/schemas/errors";
import { publishCmsPage } from "cms-content/pages/core/contracts/mutatePage";
export const pagesPublish = defineCapability({
    id: "pages.publish",
    description: "Publish or unpublish one Page with optimistic revision control.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/pages/publish",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    CORE_UNAVAILABLE: 503,
                    INVALID_PAGE: 422,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_pages_publish",
                description:
                    "Publish or hide an existing Page using its current expectedRevision and the visible flag.",
            },
        },
    ],
    docs: ["overview.md", "pages/create-and-publish.md", "pages/verify.md", "pages/revisions.md"],
    input: pagesPublishInputSchema,
    output: pageDetailsSchema,
    errors,
    execute: ({ services, input }) => publishCmsPage(services.repo, input),
});
