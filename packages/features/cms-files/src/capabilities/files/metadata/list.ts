import { defineCapability } from "cms-files/capabilities/define";
import { fileCall } from "cms-files/capabilities/support";
import { listFilesInputSchema, listFilesOutputSchema } from "cms-files/schemas/files";
import { credentialErrors as errors } from "cms-files/schemas/errors";

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
    execute: ({ input, services, fail }) => fileCall(errors, fail, () => services.files.listFiles(input)),
});
