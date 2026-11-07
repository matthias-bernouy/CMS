import { defineCapability } from "cms-content/application/capabilities/define";
import { siteBlocsCreateInputSchema, siteBlocSchema } from "cms-content/application/schemas/site";
import { siteBlocsCreateErrors as errors } from "cms-content/application/schemas/errors";
import { createCmsSiteBloc } from "cms-content/blocs/core/catalogue/siteBlocContracts";
export const siteBlocsCreate = defineCapability({
    id: "site-blocs.create",
    description: "Create a draft site-owned reusable composition from validated Page markup.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/site-blocs/create",
            input: { body: true },
            response: {
                successStatuses: [201],
                contentTypes: ["application/json"],
                errorStatuses: { TAG_CONFLICT: 409, INVALID_SITE_BLOC: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_site_blocs_create",
                description:
                    "Create a site-local reusable content Bloc from installed components. Use Repository tools for a new distributable collection component.",
            },
        },
    ],
    docs: ["overview.md"],
    input: siteBlocsCreateInputSchema,
    output: siteBlocSchema,
    errors,
    execute: ({ services, input }) => createCmsSiteBloc(services.repo, input),
});
