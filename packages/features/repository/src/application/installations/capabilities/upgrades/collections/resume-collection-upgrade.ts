import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { applyCollectionUpgradeOutputSchema } from "repository/application/installations/schemas/upgrades/collections/apply-collection-upgrade";
import { resumeCollectionUpgradeInputSchema } from "repository/application/installations/schemas/upgrades/collections/resume-collection-upgrade";
import { resumeCollectionUpgradeErrors as errors } from "repository/application/installations/schemas/common/failures";
import { projectUpgradeResult } from "repository/application/installations/core/collections/projection";
export const resumeCollectionUpgrade = defineCapability({
    id: "resume-collection-upgrade",
    access: "admin",
    description: "Resolve a pending release switch using its original pins after an interrupted commit.",
    behavior: { effect: "command", execution: "operation", idempotency: "keyed", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/resume-collection-upgrade",
            input: { body: true },
            response: {
                successStatuses: [202],
                contentTypes: ["application/json"],
                errorStatuses: {
                    CORE_UNAVAILABLE: 503,
                    NOT_FOUND: 404,
                    INVALID_INPUT: 422,
                    REVISION_CONFLICT: 409,
                    UPGRADE_IN_PROGRESS: 423,
                    IDEMPOTENCY_CONFLICT: 409,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: { name: "installations_resume_collection_upgrade", description: "resume collection upgrade" },
        },
    ],
    docs: ["overview.md"],
    input: resumeCollectionUpgradeInputSchema,
    output: applyCollectionUpgradeOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        projectUpgradeResult(await services.collectionUpgrades.resume(context.siteId, input.upgradeId)),
});
