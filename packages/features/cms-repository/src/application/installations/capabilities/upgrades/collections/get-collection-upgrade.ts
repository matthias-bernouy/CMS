import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import { applyCollectionUpgradeOutputSchema } from "cms-repository/application/installations/schemas/upgrades/collections/apply-collection-upgrade";
import { resumeCollectionUpgradeInputSchema } from "cms-repository/application/installations/schemas/upgrades/collections/resume-collection-upgrade";
import { getCollectionUpgradeErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { collectionUpgrade } from "cms-repository/application/installations/core/collections/queries";
export const getCollectionUpgrade = defineCapability({
    id: "get-collection-upgrade",
    access: "admin",
    description: "Read the status of one exact release-switch intent.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-collection-upgrade",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503, NOT_FOUND: 404, INVALID_INPUT: 422, REVISION_CONFLICT: 409 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: { name: "installations_get_collection_upgrade", description: "get collection upgrade" },
        },
    ],
    docs: ["overview.md"],
    input: resumeCollectionUpgradeInputSchema,
    output: applyCollectionUpgradeOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        collectionUpgrade(services.collectionUpgrades, context.siteId, input.upgradeId),
});
