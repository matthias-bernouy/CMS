import { defineCapability } from "cms-repository/application/registry/capabilities/define";
import {
    namespaceClaimInputSchema,
    namespaceGetOutputSchema,
} from "cms-repository/application/registry/schemas/namespaces";
import { assetDownloadErrors as errors } from "cms-repository/application/registry/schemas/errors";
export const namespaceGet = defineCapability({
    id: "namespace-get",
    description: "Read public namespace metadata without exposing its owner account identifier.",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/namespaces/get",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: namespaceClaimInputSchema,
    output: namespaceGetOutputSchema,
    errors,
    execute: ({ services, input }) => services.repository.reads.namespace(input),
});
