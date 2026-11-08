import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import {
    planCollectionUpgradeInputSchema,
    planCollectionUpgradeOutputSchema,
} from "cms-repository/application/installations/schemas/upgrades/collections/plan-collection-upgrade";
import { getContractUpgradeErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { planCollections } from "cms-repository/application/installations/core/collections/mutations";
export const planCollectionUpgrade = defineCapability({
    id: "plan-collection-upgrade",
    access: "admin",
    description:
        "Analyse exact collection targets and current site usage without rewriting any content. Incomplete or blocked plans cannot be applied.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/plan-collection-upgrade",
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
            tool: { name: "installations_plan_collection_upgrade", description: "plan collection upgrade" },
        },
    ],
    docs: ["overview.md"],
    input: planCollectionUpgradeInputSchema,
    output: planCollectionUpgradeOutputSchema,
    errors,
    execute: async ({ services, input, context }) => planCollections(services, context.siteId, input.targets),
});
