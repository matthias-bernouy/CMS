import { defineCapability } from "cms-secrets/capabilities/define";
import { secretCall } from "cms-secrets/capabilities/support";
import { namespaceErrors as errors } from "cms-secrets/schemas/errors";
import { listSecretsInputSchema, listSecretsOutputSchema } from "cms-secrets/schemas/secrets";

export const listSecrets = defineCapability({
    id: "secrets.list",
    description: "List bounded secret metadata from one namespace without values.",
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
            path: "/secrets.list",
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
    input: listSecretsInputSchema,
    output: listSecretsOutputSchema,
    errors,
    execute: ({ input, services, fail }) =>
        secretCall(errors, fail, async () => ({
            items: await services.secrets.list(input.namespaceId, input.namespaceKey, input.limit ?? 100),
        })),
});
