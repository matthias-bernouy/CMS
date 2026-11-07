import { defineCapability } from "cms-files/capabilities/define";
import { fileCall } from "cms-files/capabilities/support";
import { signRepresentationsInputSchema, signRepresentationsOutputSchema } from "cms-files/schemas/representations";
import { credentialErrors as errors } from "cms-files/schemas/errors";

export const signRepresentations = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "representations.sign",
    description: "Mint temporary private URLs for available image representations.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/files/{fileId}/{generation}/representations/sign",
            input: {
                path: { fileId: "fileId", generation: "generation" },
                body: { properties: ["namespaceId", "namespaceKey", "expiresIn"] },
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
    input: signRepresentationsInputSchema,
    output: signRepresentationsOutputSchema,
    errors,
    execute: ({ input, services, fail }) =>
        fileCall(errors, fail, () =>
            services.files.signRepresentations({
                namespaceId: input.namespaceId,
                namespaceKey: input.namespaceKey,
                fileId: input.fileId,
                generation: input.generation,
                expiresInSeconds: input.expiresIn,
            }),
        ),
});
