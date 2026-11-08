import { defineCapability } from "secrets/capabilities/define";
import { secretMutationErrors as errors } from "secrets/schemas/errors";
import { rotateSecretInputSchema, rotatedSecretMetadataSchema } from "secrets/schemas/secrets";

export const rotateSecret = defineCapability({
    id: "secrets.rotate",
    description: "Replace one secret value while preserving its namespace identity.",
    access: "admin",
    behavior: {
        effect: "command",
        idempotency: "keyed",
        execution: "sync",
        sensitive: true,
    },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/namespaces/{namespaceId}/secrets/{secretId}/rotate",
            input: {
                path: {
                    namespaceId: "namespaceId",
                    secretId: "secretId",
                },
                body: {
                    properties: ["namespaceKey", "value", "expectedVersion"],
                },
            },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_AUTHORIZED: 403,
                    NOT_FOUND: 404,
                    VERSION_CONFLICT: 409,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: rotateSecretInputSchema,
    output: rotatedSecretMetadataSchema,
    errors,
    authorize: ({ input, services }) =>
        services.secrets.authorizeNamespace(input.namespaceId, input.namespaceKey, "secrets.write"),
    execute: ({ input, services }) =>
        services.secrets.rotate(
            input.namespaceId,
            input.namespaceKey,
            input.secretId,
            input.expectedVersion,
            input.value,
        ),
});
