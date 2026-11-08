import { defineCapability } from "repository/application/registry/capabilities/define";
import { repositoryInfoOutputSchema } from "repository/application/registry/schemas/catalogue/listing";
import { emptyInputSchema } from "repository/application/registry/schemas/common";
import { assetDownloadErrors as errors } from "repository/application/registry/schemas/errors";
export const repositoryInfo = defineCapability({
    id: "repository-info",
    description: "repository-info",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/v1/info",
            input: {},
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: emptyInputSchema,
    output: repositoryInfoOutputSchema,
    errors,
    execute: ({ services }) => services.repository.reads.info(),
});
