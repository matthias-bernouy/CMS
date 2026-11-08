import { defineCapability } from "content/application/capabilities/define";
import { emptyInputSchema } from "content/application/schemas/common";
import { siteBlocsListOutputSchema } from "content/application/schemas/site";
import { serviceErrors as errors } from "content/application/schemas/errors";
import { listCmsSiteBlocs } from "content/blocs/core/catalogue/siteBlocContracts";
export const siteBlocsList = defineCapability({
    id: "site-blocs.list",
    description: "List site-owned reusable compositions.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/site-blocs/list",
            input: {},
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_site_blocs_list",
                description:
                    "List this site’s local reusable content Blocs. Use Repository tools to author distributable collection Blocs.",
            },
        },
    ],
    docs: ["overview.md"],
    input: emptyInputSchema,
    output: siteBlocsListOutputSchema,
    errors,
    execute: ({ services }) => listCmsSiteBlocs(services.repo),
});
