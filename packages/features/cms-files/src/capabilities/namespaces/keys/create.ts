import { defineCapability } from "cms-files/capabilities/define";
import { createNamespaceKeyInputSchema, createNamespaceKeyOutputSchema } from "cms-files/schemas/namespaces";
import { credentialErrors as errors } from "cms-files/schemas/errors";

export const createNamespaceKey = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "namespace.keys.create",
    description: "Create another scoped namespace credential.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/namespaces/{namespaceId}/keys",
            input: {
                path: { namespaceId: "namespaceId" },
                body: { properties: ["namespaceKey", "permissions", "expiresAt"] },
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
    input: createNamespaceKeyInputSchema,
    output: createNamespaceKeyOutputSchema,
    errors,
    execute: ({ input, services }) =>
        services.files.createNamespaceKey({ ...input, expiresAt: input.expiresAt ?? undefined }),
});
