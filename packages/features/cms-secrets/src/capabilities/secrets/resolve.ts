import { defineCapability } from "cms-secrets/capabilities/define";
import { namespaceErrors as errors } from "cms-secrets/schemas/errors";
import { secretReferenceSchema, resolvedSecretSchema } from "cms-secrets/schemas/secrets";

export const resolveSecret = defineCapability({
    id: "secrets.resolve",
    description: "Resolve one secret value using a namespace credential with explicit resolve permission.",
    access: "admin",
    behavior: {
        effect: "query",
        execution: "sync",
        sensitive: true,
    },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/secrets.resolve",
            input: {
                body: true,
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
    input: secretReferenceSchema,
    output: resolvedSecretSchema,
    errors,
    execute: ({ input, services }) => services.secrets.resolve(input.namespaceId, input.namespaceKey, input.secretId),
});
