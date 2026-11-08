import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import { applyContractUpgradeOutputSchema } from "cms-repository/application/installations/schemas/upgrades/contracts/apply-contract-upgrade";
import { resumeContractUpgradeInputSchema } from "cms-repository/application/installations/schemas/upgrades/contracts/resume-contract-upgrade";
import { getContractUpgradeErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { contractUpgrade } from "cms-repository/application/installations/core/upgrades/contracts";
export const getContractUpgrade = defineCapability({
    id: "get-contract-upgrade",
    access: "admin",
    description: "Read the state of one site contract release switch.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-contract-upgrade",
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
                name: "installations_get_contract_upgrade",
                description: "Read the state of one site contract release switch.",
            },
        },
    ],
    docs: ["overview.md"],
    input: resumeContractUpgradeInputSchema,
    output: applyContractUpgradeOutputSchema,
    errors,
    execute: async ({ services, input, context }) => contractUpgrade(services, context.siteId, input.upgradeId),
});
