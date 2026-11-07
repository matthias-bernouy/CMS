import { defineCapability } from "cms-content/application/capabilities/define";
import { pagesUpdateRouteInputSchema } from "cms-content/application/schemas/pages/inputs";
import { pageRouteDetailsSchema } from "cms-content/application/schemas/pages/outputs";
import { pagesUpdateRouteErrors as errors } from "cms-content/application/schemas/errors";
import { updateCmsPageRoute } from "cms-content/pages/core/contracts/presentation";
export const pagesUpdateRoute = defineCapability({
    id: "pages.update-route",
    description: "Update one localized Page route with optimistic revision control.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/pages/update-route",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    PATH_CONFLICT: 409,
                    INVALID_PAGE: 422,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_pages_update_route",
                description: "Change a Page’s route for one language using its current expectedRevision.",
            },
        },
    ],
    docs: ["overview.md", "pages/create-and-publish.md", "pages/verify.md", "pages/revisions.md"],
    input: pagesUpdateRouteInputSchema,
    output: pageRouteDetailsSchema,
    errors,
    execute: ({ services, input }) => updateCmsPageRoute(services.repo, input),
});
