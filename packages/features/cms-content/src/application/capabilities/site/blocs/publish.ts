import { defineCapability } from "cms-content/application/capabilities/define";
import { siteBlocRevisionInputSchema, siteBlocSchema } from "cms-content/application/schemas/site";
import { siteBlocsPublishErrors as errors } from "cms-content/application/schemas/errors";
import { publishCmsSiteBloc } from "cms-content/blocs/core/catalogue/siteBlocContracts";
export const siteBlocsPublish = defineCapability({
    id: "site-blocs.publish",
    description: "Publish the current draft of a site-owned reusable composition.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/site-blocs/publish",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    INVALID_SITE_BLOC: 422,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_site_blocs_publish",
                description: "Publish the current revision of a site-local content Bloc.",
            },
        },
    ],
    docs: ["overview.md"],
    input: siteBlocRevisionInputSchema,
    output: siteBlocSchema,
    errors,
    execute: ({ services, input }) => publishCmsSiteBloc(services.repo, input),
});
