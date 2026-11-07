import { z } from "zod";
import { defineCapability } from "cms-files/capabilities/define";
import { fileCall } from "cms-files/capabilities/support";
import { fileCredentialsSchema } from "cms-files/schemas/files";
import { credentialErrors as errors } from "cms-files/schemas/errors";

export const deleteFile = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "files.delete",
    description: "Delete every generation of one file.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "DELETE",
            path: "/files/{fileId}",
            input: { path: { fileId: "fileId" }, body: { properties: ["namespaceId", "namespaceKey"] } },
            response: {
                successStatuses: [204],
                contentTypes: [],
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
    output: z.null(),
    errors,
    execute: ({ input, services, fail }) =>
        fileCall(errors, fail, async () => {
            await services.files.deleteFile(input.namespaceId, input.namespaceKey, input.fileId);
            return null;
        }),
});
