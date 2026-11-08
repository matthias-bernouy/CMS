import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import {
    capabilitiesDescribeInputSchema,
    capabilitiesDescribeOutputSchema,
} from "cms-repository/application/installations/schemas/discovery/capabilities.describe";
import { capabilitiesDescribeErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { describeCapabilities } from "cms-repository/application/installations/core/discovery";
export const capabilitiesDescribe = defineCapability({
    id: "capabilities.describe",
    description:
        "Read the selected public capability access metadata for one contract, without Provider origins, credentials or business data.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/capabilities/describe",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: capabilitiesDescribeInputSchema,
    output: capabilitiesDescribeOutputSchema,
    errors,
    execute: async ({ services, input }) => describeCapabilities(services.gateway, input.contractId),
});
