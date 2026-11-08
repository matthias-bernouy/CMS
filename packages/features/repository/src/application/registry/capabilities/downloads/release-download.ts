import { defineCapability } from "repository/application/registry/capabilities/define";
import { releaseDownloadOutputSchema } from "repository/application/registry/schemas/downloads";
import { publicationStateInputSchema } from "repository/application/registry/schemas/publications/state";
import { assetDownloadErrors as errors } from "repository/application/registry/schemas/errors";
import { downloadResponse } from "repository/application/registry/core/download";
export const releaseDownload = defineCapability({
    id: "release-download",
    description: "release-download",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/v1/releases/{kind}/{publisherId}/{id}/{version}",
            input: { path: { kind: "kind", publisherId: "publisherId", id: "id", version: "version" } },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationStateInputSchema,
    output: releaseDownloadOutputSchema,
    errors,
    execute: async ({ services, input }) => downloadResponse(await services.repository.reads.release(input), false),
});
