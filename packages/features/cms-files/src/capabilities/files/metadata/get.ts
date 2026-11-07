import { defineCapability } from "cms-files/capabilities/define";
import { fileCall } from "cms-files/capabilities/support";
import { fileCredentialsSchema } from "cms-files/schemas/files";
import { fileReferenceSchema } from "cms-files/schemas/values";
import { credentialErrors as errors } from "cms-files/schemas/errors";

export const getFile = defineCapability({
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    id: "files.get",
    description: "Get the latest generation metadata for a file.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/files/{fileId}",
            input: {
                path: { fileId: "fileId" },
                headers: {
                    "namespace-key": { property: "namespaceKey", encoding: "uri-component" },
                    "namespace-id": { property: "namespaceId", encoding: "uri-component" },
                },
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
    input: fileCredentialsSchema,
    output: fileReferenceSchema,
    errors,
    execute: ({ input, services, fail }) => fileCall(errors, fail, () => services.files.getFile(input)),
});
