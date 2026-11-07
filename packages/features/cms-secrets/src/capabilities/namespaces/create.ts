import { defineCapability } from "cms-secrets/capabilities/define";
import { namespaceCreationErrors as errors } from "cms-secrets/schemas/errors";
import { createNamespaceInputSchema, createNamespaceOutputSchema } from "cms-secrets/schemas/namespaces";

export const createNamespace = defineCapability({
    id: "namespace.create",
    description: "Create a credential-owned secret namespace.",
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
            path: "/namespaces",
            input: {
                body: true,
            },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: createNamespaceInputSchema,
    output: createNamespaceOutputSchema,
    errors,
    execute: ({ input, services, context }) =>
        services.secrets.createNamespace({
            name: input.name,
            createdBy: {
                kind: context.subjectId ? "administrator" : "system",
                id: context.subjectId ?? "cms-gateway",
            },
        }),
});
