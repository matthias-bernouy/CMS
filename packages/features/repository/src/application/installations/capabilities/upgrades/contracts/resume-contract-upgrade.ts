import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { applyContractUpgradeOutputSchema } from "repository/application/installations/schemas/upgrades/contracts/apply-contract-upgrade";
import { resumeContractUpgradeInputSchema } from "repository/application/installations/schemas/upgrades/contracts/resume-contract-upgrade";
import { applyCollectionUpgradeErrors as errors } from "repository/application/installations/schemas/common/failures";
import { contractUpgrades, projectContractUpgrade } from "repository/application/installations/core/upgrades/contracts";
export const resumeContractUpgrade = defineCapability({
    id: "resume-contract-upgrade",
    access: "admin",
    description: "Resume one durable site contract release switch.",
    behavior: { effect: "command", execution: "operation", idempotency: "keyed", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/resume-contract-upgrade",
            input: { body: true },
            response: {
                successStatuses: [202],
                contentTypes: ["application/json"],
                errorStatuses: {
                    CORE_UNAVAILABLE: 503,
                    NOT_FOUND: 404,
                    INVALID_INPUT: 422,
                    REVISION_CONFLICT: 409,
                    RELEASE_MISMATCH: 409,
                    BROWSER_CAPABILITIES_APPROVAL_REQUIRED: 409,
                    UPGRADE_IN_PROGRESS: 423,
                    IDEMPOTENCY_CONFLICT: 409,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_resume_contract_upgrade",
                description: "Resume one durable site contract release switch.",
            },
        },
    ],
    docs: ["overview.md"],
    input: resumeContractUpgradeInputSchema,
    output: applyContractUpgradeOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        projectContractUpgrade(await contractUpgrades(services).resume(context.siteId, input.upgradeId)),
});
