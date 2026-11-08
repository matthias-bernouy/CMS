import { defineCapability } from "repository/application/registry/capabilities/define";
import { assetDownloadInputSchema, assetDownloadOutputSchema } from "repository/application/registry/schemas/downloads";
import { assetDownloadErrors as errors } from "repository/application/registry/schemas/errors";
import { downloadResponse } from "repository/application/registry/core/download";
export const assetDownload = defineCapability({
    id: "asset-download",
    description: "Download one verified immutable asset belonging to a published release.",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/v1/assets/{kind}/{publisherId}/{id}/{version}/{assetId}",
            input: {
                path: { kind: "kind", publisherId: "publisherId", id: "id", version: "version", assetId: "assetId" },
            },
            response: {
                successStatuses: [200],
                contentTypes: ["application/octet-stream"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: assetDownloadInputSchema,
    output: assetDownloadOutputSchema,
    errors,
    execute: async ({ services, input }) => downloadResponse(await services.repository.reads.asset(input), true),
});
