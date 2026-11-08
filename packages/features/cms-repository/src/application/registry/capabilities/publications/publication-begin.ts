import { defineCapability } from "cms-repository/application/registry/capabilities/define";
import {
    publicationBeginInputSchema,
    publicationBeginOutputSchema,
} from "cms-repository/application/registry/schemas/publications/uploads";
import { namespaceClaimErrors as errors } from "cms-repository/application/registry/schemas/errors";
export const publicationBegin = defineCapability({
    id: "publication-begin",
    description: "Stage a bounded account-authorized publication manifest; assets are uploaded separately.",
    access: "authenticated",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/v1/uploads",
            input: {
                headers: {
                    "x-repository-namespace": { property: "namespace", encoding: "uri-component" },
                    "x-repository-namespace-revision": { property: "namespaceRevision", encoding: "uri-component" },
                },
                body: { binaryProperty: "manifest" },
            },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationBeginInputSchema,
    output: publicationBeginOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.publications.begin(
            input,
            await services.resolveRepositoryAccount(context),
            context.binaryBody,
        ),
});
