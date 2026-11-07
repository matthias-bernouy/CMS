import { defineCapability } from "cms-files/capabilities/define";
import { signFileInputSchema, signFileOutputSchema } from "cms-files/schemas/files";
import { credentialErrors as errors } from "cms-files/schemas/errors";

export const signFile = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "files.sign",
    description: "Mint a temporary private read URL.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/files/{fileId}/sign",
            input: {
                path: { fileId: "fileId" },
                body: { properties: ["namespaceId", "namespaceKey", "generation", "operation", "expiresIn"] },
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
    input: signFileInputSchema,
    output: signFileOutputSchema,
    errors,
    execute: ({ input, services }) =>
        services.files.signFile({
            namespaceId: input.namespaceId,
            namespaceKey: input.namespaceKey,
            fileId: input.fileId,
            generation: input.generation,
            expiresInSeconds: input.expiresIn,
        }),
});
