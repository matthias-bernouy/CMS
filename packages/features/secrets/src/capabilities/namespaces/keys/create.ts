import { defineCapability } from "secrets/capabilities/define";
import { namespaceErrors as errors } from "secrets/schemas/errors";
import { createNamespaceKeyInputSchema, futureNamespaceExpirationSchema } from "secrets/schemas/keys";
import { namespaceCredentialSchema } from "secrets/schemas/namespaces";

export const createNamespaceKey = defineCapability({
    id: "namespace.keys.create",
    description: "Create another scoped secret namespace credential.",
    access: "admin",
    behavior: {
        effect: "command",
        idempotency: "none",
        execution: "sync",
        sensitive: true,
    },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/namespaces/{namespaceId}/keys",
            input: {
                path: {
                    namespaceId: "namespaceId",
                },
                body: {
                    properties: ["namespaceKey", "permissions", "expiresAt"],
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
    docs: ["overview.md"],
    input: createNamespaceKeyInputSchema,
    output: namespaceCredentialSchema,
    errors,
    execute: ({ input, services }) =>
        services.secrets.createNamespaceKey({
            namespaceId: input.namespaceId,
            namespaceKey: input.namespaceKey,
            permissions: input.permissions,
            ...(input.expiresAt === undefined
                ? {}
                : { expiresAt: futureNamespaceExpirationSchema.parse(input.expiresAt) }),
        }),
});
