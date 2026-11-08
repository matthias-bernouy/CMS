import { defineCapability } from "repository/application/registry/capabilities/define";
import {
    catalogueListInputSchema,
    catalogueListOutputSchema,
} from "repository/application/registry/schemas/catalogue/listing";
import { assetDownloadErrors as errors } from "repository/application/registry/schemas/errors";
export const catalogueList = defineCapability({
    id: "catalogue-list",
    description:
        "List public releases with bounded pagination and optional exact publisher, resource and version filters.",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/catalogue",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: catalogueListInputSchema,
    output: catalogueListOutputSchema,
    errors,
    execute: ({ services, input }) => services.repository.reads.catalogue(input),
});
