import { defineCapability } from "repository/application/registry/capabilities/define";
import { nullOutputSchema } from "repository/application/registry/schemas/common";
import { publicationAssetInputSchema } from "repository/application/registry/schemas/publications/uploads";
import { namespaceClaimErrors as errors } from "repository/application/registry/schemas/errors";
export const publicationAsset = defineCapability({
    id: "publication-asset",
    description: "publication-asset",
    access: "authenticated",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "PUT",
            path: "/v1/uploads/{uploadId}/assets/{assetId}",
            input: {
                path: { uploadId: "uploadId", assetId: "assetId" },
                headers: {
                    "x-repository-namespace": { property: "namespace", encoding: "uri-component" },
                    "x-repository-namespace-revision": { property: "namespaceRevision", encoding: "uri-component" },
                    "x-repository-content-digest": { property: "contentDigest", encoding: "uri-component" },
                },
                body: { binaryProperty: "bytes" },
            },
            response: {
                successStatuses: [204],
                contentTypes: [],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationAssetInputSchema,
    output: nullOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.publications.asset(
            input,
            await services.resolveRepositoryAccount(context),
            context.binaryBody,
        ),
});
