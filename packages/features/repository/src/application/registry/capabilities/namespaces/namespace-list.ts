import { defineCapability } from "repository/application/registry/capabilities/define";
import { emptyInputSchema } from "repository/application/registry/schemas/common";
import { namespaceListOutputSchema } from "repository/application/registry/schemas/namespaces";
import { namespaceClaimErrors as errors } from "repository/application/registry/schemas/errors";
export const namespaceList = defineCapability({
    id: "namespace-list",
    description: "List the authenticated account's namespaces without exposing private account identifiers.",
    access: "authenticated",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/v1/namespaces",
            input: {},
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: emptyInputSchema,
    output: namespaceListOutputSchema,
    errors,
    execute: async ({ services, context }) =>
        services.repository.namespaces.list(await services.resolveRepositoryAccount(context)),
});
