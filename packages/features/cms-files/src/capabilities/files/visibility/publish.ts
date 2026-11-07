import { defineCapability } from "cms-files/capabilities/define";
import { fileCredentialsSchema } from "cms-files/schemas/files";
import { fileReferenceSchema } from "cms-files/schemas/values";
import { credentialErrors as errors } from "cms-files/schemas/errors";

export const publishFile = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "files.publish",
    description: "Make a file public.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/files/{fileId}/publish",
            input: { path: { fileId: "fileId" }, body: { properties: ["namespaceId", "namespaceKey"] } },
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
    execute: ({ input, services }) => services.files.setFileVisibility({ ...input, visibility: "public" }),
});
