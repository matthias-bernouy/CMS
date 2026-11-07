import { defineCapability } from "cms-content/application/capabilities/define";
import { siteBlocRevisionInputSchema, siteBlocSchema } from "cms-content/application/schemas/site";
import { siteBlocsArchiveErrors as errors } from "cms-content/application/schemas/errors";
import { setCmsSiteBlocArchived } from "cms-content/blocs/core/catalogue/siteBlocContracts";
export const siteBlocsArchive = defineCapability({
    id: "site-blocs.archive",
    description: "Archive a site-owned reusable composition.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/site-blocs/archive",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    NOT_FOUND: 404,
                    REVISION_CONFLICT: 409,
                    TAG_CONFLICT: 409,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_site_blocs_archive",
                description: "Archive a site-local content Bloc using its current revision.",
            },
        },
    ],
    docs: ["overview.md"],
    input: siteBlocRevisionInputSchema,
    output: siteBlocSchema,
    errors,
    execute: ({ services, input }) => setCmsSiteBlocArchived(services.repo, input, true),
});
