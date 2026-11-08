import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    applyContractUpgradeInputSchema,
    applyContractUpgradeOutputSchema,
} from "repository/application/installations/schemas/upgrades/contracts/apply-contract-upgrade";
import { applyCollectionUpgradeErrors as errors } from "repository/application/installations/schemas/common/failures";
import {
    contractUpgrades,
    selectionTargets,
    projectContractUpgrade,
} from "repository/application/installations/core/upgrades/contracts";
import { parseCapabilityGrants } from "@bernouy/ulvia-providers/selections";
export const applyContractUpgrade = defineCapability({
    id: "apply-contract-upgrade",
    access: "admin",
    description: "Atomically apply a current reviewed selection and grant plan without editing site content.",
    behavior: { effect: "command", execution: "operation", idempotency: "keyed", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/apply-contract-upgrade",
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
                name: "installations_apply_contract_upgrade",
                description:
                    "Atomically apply a current reviewed selection and grant plan without editing site content.",
            },
        },
    ],
    docs: ["overview.md"],
    input: applyContractUpgradeInputSchema,
    output: applyContractUpgradeOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        projectContractUpgrade(
            await contractUpgrades(services).apply(
                context.siteId,
                selectionTargets(input.selections, context.siteId),
                input.grants === undefined ? undefined : parseCapabilityGrants(input.grants),
                input.planDigest,
            ),
        ),
});
