import { defineCapability } from "cms-repository/application/registry/capabilities/define";
import {
    namespaceClaimInputSchema,
    namespaceClaimOutputSchema,
} from "cms-repository/application/registry/schemas/namespaces";
import { namespaceClaimErrors as errors } from "cms-repository/application/registry/schemas/errors";
export const namespaceClaim = defineCapability({
    id: "namespace-claim",
    description: "Claim an available namespace for the authenticated account. Administrator access is not required.",
    access: "authenticated",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/v1/namespace-actions/claim",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: namespaceClaimInputSchema,
    output: namespaceClaimOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.namespaces.claim(input, await services.resolveRepositoryAccount(context)),
});
