import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    repositoryGetInputSchema,
    repositoryGetOutputSchema,
} from "repository/application/installations/schemas/discovery/repository.get";
import { repositoryGetErrors as errors } from "repository/application/installations/schemas/common/failures";
import { required } from "repository/application/installations/core/requirements";
export const repositoryGet = defineCapability({
    id: "repository.get",
    description:
        "Read verified public metadata from one exact repository release before installation. Optionally inspect one Bloc or collection example. Follow nextOffset for continuation. Does not install resources, execute assets or read selected-contract documentation.",
    docs: ["repository-discovery.md"],
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/repository/get",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
                    RELEASE_MISMATCH: 409,
                    REVISION_CONFLICT: 409,
                    CATALOGUE_TOO_LARGE: 422,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_repository_get",
                description:
                    "Read verified public metadata from one exact repository release before installation. Optionally inspect one Bloc or collection example. Follow nextOffset for continuation. Does not install resources, execute assets or read selected-contract documentation.",
            },
        },
    ],
    input: repositoryGetInputSchema,
    output: repositoryGetOutputSchema,
    errors,
    execute: async ({ services, input }) => required(services.discovery).get(input),
});
