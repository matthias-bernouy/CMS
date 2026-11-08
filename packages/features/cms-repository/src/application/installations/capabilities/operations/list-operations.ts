import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import {
    listOperationsInputSchema,
    listOperationsOutputSchema,
} from "cms-repository/application/installations/schemas/operations/list-operations";
import { capabilitiesDescribeErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { required } from "cms-repository/application/installations/core/requirements";
export const listOperations = defineCapability({
    id: "list-operations",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/operations",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_list_operations",
                description: "List this instance’s asynchronous operations, including site upgrade progress.",
            },
        },
    ],
    docs: ["overview.md"],
    input: listOperationsInputSchema,
    output: listOperationsOutputSchema,
    errors,
    execute: async ({ services, input, context }) => required(services.operations).list(context.siteId, input),
});
