import { defineCapability } from "content/application/capabilities/define";
import { pagesCreateInputSchema } from "content/application/schemas/pages/inputs";
import { pageDetailsSchema } from "content/application/schemas/pages/outputs";
import { pagesCreateErrors as errors } from "content/application/schemas/errors";
import { createCmsPage } from "content/pages/core/contracts/createPage";
export const pagesCreate = defineCapability({
    id: "pages.create",
    description: "Create one Page draft with optional HTML content.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/pages/create",
            input: { body: true },
            response: {
                successStatuses: [201],
                contentTypes: ["application/json"],
                errorStatuses: { PATH_CONFLICT: 409, INVALID_PAGE: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_pages_create",
                description:
                    "Create a Page draft using installed Blocs. Read the Page design guide for new layouts and review the rendered draft. Publication is separate.",
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
    input: pagesCreateInputSchema,
    output: pageDetailsSchema,
    errors,
    execute: ({ services, input }) => createCmsPage(services.repo, input),
});
