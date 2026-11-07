import { defineCapability } from "cms-content/application/capabilities/define";
import { siteBlocsGetInputSchema, siteBlocSchema } from "cms-content/application/schemas/site";
import { lookupErrors as errors } from "cms-content/application/schemas/errors";
import { getCmsSiteBloc } from "cms-content/blocs/core/catalogue/siteBlocContracts";
export const siteBlocsGet = defineCapability({
    id: "site-blocs.get",
    description: "Read one site-owned reusable composition.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/site-blocs/get",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_site_blocs_get",
                description: "Read one site-local content Bloc and its current revision before editing its lifecycle.",
            },
        },
    ],
    docs: ["overview.md"],
    input: siteBlocsGetInputSchema,
    output: siteBlocSchema,
    errors,
    execute: ({ services, input }) => getCmsSiteBloc(services.repo, input),
});
