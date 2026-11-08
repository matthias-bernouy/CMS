import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    getOperationInputSchema,
    getOperationOutputSchema,
} from "repository/application/installations/schemas/operations/get-operation";
import { getOperationErrors as errors } from "repository/application/installations/schemas/common/failures";
import { required } from "repository/application/installations/core/requirements";
export const getOperation = defineCapability({
    id: "get-operation",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/operations/get",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_get_operation",
                description:
                    "Read one asynchronous operation until it succeeds or fails. Use this after a site upgrade command.",
            },
        },
    ],
    docs: ["overview.md"],
    input: getOperationInputSchema,
    output: getOperationOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        required(services.operations).get(context.siteId, input.operationId),
});
