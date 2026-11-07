import { defineCapability } from "cms-files/capabilities/define";
import { listRepresentationsInputSchema, listRepresentationsOutputSchema } from "cms-files/schemas/representations";
import { listRepresentationsErrors as errors } from "cms-files/schemas/errors";

export const listRepresentations = defineCapability({
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    id: "representations.list",
    description: "List available image representations.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/files/{fileId}/{generation}/representations",
            input: {
                path: { fileId: "fileId", generation: "generation" },
                query: { access: "access" },
                headers: { "namespace-key": { property: "namespaceKey", encoding: "uri-component" } },
            },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_AUTHORIZED: 403, NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: listRepresentationsInputSchema,
    output: listRepresentationsOutputSchema,
    errors,
    execute: ({ input, services }) =>
        services.files.listRepresentations({
            ...input,
            access: input.access ?? undefined,
            namespaceKey: input.namespaceKey ?? undefined,
        }),
});
