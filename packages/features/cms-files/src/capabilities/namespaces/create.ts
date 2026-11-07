import { defineCapability } from "cms-files/capabilities/define";
import { createNamespaceInputSchema, createNamespaceOutputSchema } from "cms-files/schemas/namespaces";
import { createNamespaceErrors as errors } from "cms-files/schemas/errors";

export const createNamespace = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "namespace.create",
    description: "Create a credential-owned file namespace.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/namespaces",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: createNamespaceInputSchema,
    output: createNamespaceOutputSchema,
    errors,
    execute: ({ input, services, context }) =>
        services.files.createNamespace({
            name: input.name,
            defaultVisibility: input.defaultVisibility,
            createdBy: {
                kind: context.subjectId ? "administrator" : "system",
                id: context.subjectId ?? "cms-gateway",
            },
        }),
});
