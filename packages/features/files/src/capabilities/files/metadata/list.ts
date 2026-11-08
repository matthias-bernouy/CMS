import { defineCapability } from "files/capabilities/define";
import { listFilesInputSchema, listFilesOutputSchema } from "files/schemas/files";
import { credentialErrors as errors } from "files/schemas/errors";

export const listFiles = defineCapability({
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    id: "files.list",
    description: "List immutable file generations in a namespace.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/namespaces/{namespaceId}/files",
            input: {
                path: { namespaceId: "namespaceId" },
                headers: { "namespace-key": { property: "namespaceKey", encoding: "uri-component" } },
                query: { offset: "offset", limit: "limit" },
            },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_AUTHORIZED: 403,
                    NOT_FOUND: 404,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: listFilesInputSchema,
    output: listFilesOutputSchema,
    errors,
    execute: ({ input, services }) => services.files.listFiles(input),
});
