import { defineCapability } from "cms-secrets/capabilities/define";
import { secretCall } from "cms-secrets/capabilities/support";
import { secretDeletionErrors as errors } from "cms-secrets/schemas/errors";
import { secretMutationInputSchema, deleteSecretOutputSchema } from "cms-secrets/schemas/secrets";

export const deleteSecret = defineCapability({
    id: "secrets.delete",
    description: "Delete one secret from a credential-owned namespace.",
    access: "admin",
    behavior: {
        effect: "command",
        idempotency: "natural",
        execution: "sync",
        sensitive: true,
    },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "DELETE",
            path: "/namespaces/{namespaceId}/secrets/{secretId}",
            input: {
                path: {
                    namespaceId: "namespaceId",
                    secretId: "secretId",
                },
                query: {
                    expectedVersion: "expectedVersion",
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
                    VERSION_CONFLICT: 409,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: secretMutationInputSchema,
    output: deleteSecretOutputSchema,
    errors,
    execute: ({ input, services, fail }) =>
        secretCall(errors, fail, async () => ({
            deleted: await services.secrets.delete(
                input.namespaceId,
                input.namespaceKey,
                input.secretId,
                input.expectedVersion,
            ),
        })),
});
