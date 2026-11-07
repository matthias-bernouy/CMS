import { defineCapability } from "cms-files/capabilities/define";
import { updateFileInputSchema } from "cms-files/schemas/files";
import { fileReferenceSchema } from "cms-files/schemas/values";
import { credentialErrors as errors } from "cms-files/schemas/errors";

export const updateFile = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "files.update",
    description: "Update mutable file metadata.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "PATCH",
            path: "/files/{fileId}",
            input: {
                path: { fileId: "fileId" },
                body: { properties: ["namespaceId", "namespaceKey", "name"] },
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
    input: updateFileInputSchema,
    output: fileReferenceSchema,
    errors,
    execute: ({ input, services }) => services.files.updateFile(input),
});
