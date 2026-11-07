import { defineCapability } from "cms-secrets/capabilities/define";
import { secretCall } from "cms-secrets/capabilities/support";
import { secretCreationErrors as errors } from "cms-secrets/schemas/errors";
import { createSecretInputSchema, secretMetadataSchema } from "cms-secrets/schemas/secrets";

export const createSecret = defineCapability({
    id: "secrets.create",
    description: "Create an encrypted secret inside one credential-owned namespace.",
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
            path: "/namespaces/{namespaceId}/secrets",
            input: {
                path: {
                    namespaceId: "namespaceId",
                },
                body: {
                    properties: ["namespaceKey", "name", "value"],
                },
            },
            response: {
                successStatuses: [201],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_AUTHORIZED: 403,
                    NOT_FOUND: 404,
                    ALREADY_EXISTS: 409,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: createSecretInputSchema,
    output: secretMetadataSchema,
    errors,
    authorize: ({ input, services, fail }) =>
        secretCall(errors, fail, () =>
            services.secrets.authorizeNamespace(input.namespaceId, input.namespaceKey, "secrets.write"),
        ),
    execute: ({ input, services, fail }) =>
        secretCall(
            errors,
            fail,
            () => services.secrets.create(input.namespaceId, input.namespaceKey, input.name, input.value),
            "ALREADY_EXISTS",
        ),
});
