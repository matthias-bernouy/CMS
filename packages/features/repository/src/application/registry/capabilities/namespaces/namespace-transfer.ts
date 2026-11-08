import { defineCapability } from "repository/application/registry/capabilities/define";
import {
    namespaceTransferInputSchema,
    namespaceClaimOutputSchema,
} from "repository/application/registry/schemas/namespaces";
import { namespaceClaimErrors as errors } from "repository/application/registry/schemas/errors";
export const namespaceTransfer = defineCapability({
    id: "namespace-transfer",
    description: "Transfer an owned namespace to another existing account using the current ownership revision.",
    access: "authenticated",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/v1/namespace-actions/transfer",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: namespaceTransferInputSchema,
    output: namespaceClaimOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.namespaces.transfer(input, await services.resolveRepositoryAccount(context)),
});
