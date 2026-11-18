import { defineCapability } from "content/application/capabilities/define";
import { siteBlocsGetInputSchema, siteBlocIdentitySchema } from "content/application/schemas/site";
import { siteBlocsReadErrors as errors } from "content/application/schemas/errors";
import { readCmsSiteBlocIdentity } from "content/blocs/core/catalogue/editing/documents";

export const siteBlocsIdentity = defineCapability({
    id: "site-blocs.identity",
    description:
        "Read the stable identity and revisions of a local composition without serializing its snapshots. Use before deletion or recovery of an oversized existing draft.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/site-blocs/identity",
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
                name: "content_site_blocs_identity",
                description:
                    "Read composition identity and revisions without loading serialized draft/published snapshots, including oversized existing compositions.",
            },
        },
    ],
    docs: ["site/compositions.md", "overview.md"],
    input: siteBlocsGetInputSchema,
    output: siteBlocIdentitySchema,
    errors,
    execute: ({ services, input }) => readCmsSiteBlocIdentity(services.repo, input),
});
