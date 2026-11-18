import { defineCapability } from "content/application/capabilities/define";
import { siteBlocsGetInputSchema, siteBlocDocumentSchema } from "content/application/schemas/site";
import { siteBlocsReadErrors as errors } from "content/application/schemas/errors";
import { readCmsSiteBloc } from "content/blocs/core/catalogue/editing/documents";
export const siteBlocsRead = defineCapability({
    id: "site-blocs.read",
    description:
        "Read the complete editable draft and published snapshots of a site-owned composition. JSON snapshots preserve structure, stable slots and defaults.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/site-blocs/read",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, INVALID_SITE_BLOC: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_site_blocs_read",
                description:
                    "Read the complete editable draft and published snapshots of a site-owned composition. JSON snapshots preserve structure, stable slots and defaults.",
            },
        },
    ],
    docs: ["site/compositions.md", "overview.md"],
    input: siteBlocsGetInputSchema,
    output: siteBlocDocumentSchema,
    errors,
    execute: ({ services, input }) => readCmsSiteBloc(services.repo, input),
});
