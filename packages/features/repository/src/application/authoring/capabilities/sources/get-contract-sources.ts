import { legacySourceSnapshot } from "repository/repository/sources/bounds";
import { defineCapability } from "repository/application/authoring/capabilities/define";
import { getContractSourcesInputSchema, sourceSnapshotSchema } from "repository/application/authoring/schemas/sources";
import { authoringErrors as errors } from "repository/application/authoring/schemas/errors";
import { requiredText } from "repository/application/authoring/core/input";
export const getContractSources = defineCapability({
    id: "get-contract-sources",
    description: "Read private contract sources owned by the connected Repository account.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-contract-sources",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "authoring_get_contract_sources",
                description: "Read private contract sources owned by the connected Repository account.",
            },
        },
    ],
    docs: ["overview.md", "artifact-authoring.md", "contract-source.md"],
    input: getContractSourcesInputSchema,
    output: sourceSnapshotSchema,
    errors,
    execute: ({ services, input }) =>
        legacySourceSnapshot(
            services.authoring.artifactSources(
                "contract",
                requiredText(input.namespace),
                requiredText(input.contractId),
                requiredText(input.version),
            ),
        ),
});
