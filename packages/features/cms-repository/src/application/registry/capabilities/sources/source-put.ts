import { defineCapability } from "cms-repository/application/registry/capabilities/define";
import { nullOutputSchema } from "cms-repository/application/registry/schemas/common";
import { sourcePutInputSchema } from "cms-repository/application/registry/schemas/sources";
import { namespaceClaimErrors as errors } from "cms-repository/application/registry/schemas/errors";
export const sourcePut = defineCapability({
    id: "source-put",
    description: "Retain private immutable sources for a published collection",
    access: "authenticated",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/v1/source-snapshots/put",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: sourcePutInputSchema,
    output: nullOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.sources.putCollection(input, await services.resolveRepositoryAccount(context)),
});
