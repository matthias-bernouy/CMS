import { defineCapability } from "cms-secrets/capabilities/define";
import { namespaceErrors as errors } from "cms-secrets/schemas/errors";
import { namespaceKeyInputSchema } from "cms-secrets/schemas/keys";
import { namespaceCredentialSchema } from "cms-secrets/schemas/namespaces";

export const rotateNamespaceKey = defineCapability({
    id: "namespace.keys.rotate",
    description: "Replace and revoke one secret namespace credential.",
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
            path: "/namespaces/{namespaceId}/keys/{keyId}/rotate",
            input: {
                path: {
                    namespaceId: "namespaceId",
                    keyId: "keyId",
                },
                body: {
                    properties: ["namespaceKey"],
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
    input: namespaceKeyInputSchema,
    output: namespaceCredentialSchema,
    errors,
    execute: ({ input, services }) =>
        services.secrets.rotateNamespaceKey(input.namespaceId, input.namespaceKey, input.keyId),
});
