import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    planContractUpgradeInputSchema,
    planContractUpgradeOutputSchema,
} from "repository/application/installations/schemas/upgrades/contracts/plan-contract-upgrade";
import { getContractUpgradeErrors as errors } from "repository/application/installations/schemas/common/failures";
import { planContracts } from "repository/application/installations/core/upgrades/contracts";
export const planContractUpgrade = defineCapability({
    id: "plan-contract-upgrade",
    access: "admin",
    description:
        "Review exact site contract selections and capability grants against actual consumers and currently served releases. An optional single selection is merged with the current graph; full selections support coordinated changes.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/plan-contract-upgrade",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    CORE_UNAVAILABLE: 503,
                    NOT_FOUND: 404,
                    INVALID_INPUT: 422,
                    REVISION_CONFLICT: 409,
                    RELEASE_MISMATCH: 409,
                    BROWSER_CAPABILITIES_APPROVAL_REQUIRED: 409,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_plan_contract_upgrade",
                description:
                    "Review exact site contract selections and capability grants against actual consumers and currently served releases. An optional single selection is merged with the current graph; full selections support coordinated changes.",
            },
        },
    ],
    docs: ["overview.md"],
    input: planContractUpgradeInputSchema,
    output: planContractUpgradeOutputSchema,
    errors,
    execute: async ({ services, input, context }) => planContracts(services, context.siteId, input),
});
