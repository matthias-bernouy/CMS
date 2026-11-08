import { defineCapability } from "cms-repository/application/registry/capabilities/define";
import {
    namespaceSuspendInputSchema,
    namespaceClaimOutputSchema,
} from "cms-repository/application/registry/schemas/namespaces";
import { namespaceClaimErrors as errors } from "cms-repository/application/registry/schemas/errors";
export const namespaceSuspend = defineCapability({
    id: "namespace-suspend",
    description: "Suspend publication in an owned namespace without releasing its reservation.",
    access: "authenticated",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/v1/namespace-actions/suspend",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: namespaceSuspendInputSchema,
    output: namespaceClaimOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.namespaces.suspend(input, await services.resolveRepositoryAccount(context)),
});
