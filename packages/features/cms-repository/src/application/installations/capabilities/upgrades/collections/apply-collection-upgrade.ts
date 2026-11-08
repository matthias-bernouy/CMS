import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import {
    applyCollectionUpgradeInputSchema,
    applyCollectionUpgradeOutputSchema,
} from "cms-repository/application/installations/schemas/upgrades/collections/apply-collection-upgrade";
import { applyCollectionUpgradeErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { collectionTargets } from "cms-repository/application/installations/core/collections/mutations";
import { projectUpgradeResult } from "cms-repository/application/installations/core/collections/projection";
export const applyCollectionUpgrade = defineCapability({
    id: "apply-collection-upgrade",
    access: "admin",
    description: "Apply one current reviewed release-switch plan. Page documents are never transformed.",
    behavior: { effect: "command", execution: "operation", idempotency: "keyed", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/apply-collection-upgrade",
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
            tool: { name: "installations_apply_collection_upgrade", description: "apply collection upgrade" },
        },
    ],
    docs: ["overview.md"],
    input: applyCollectionUpgradeInputSchema,
    output: applyCollectionUpgradeOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        projectUpgradeResult(
            await services.collectionUpgrades.apply(
                context.siteId,
                await collectionTargets(input.targets, services.sources),
                input.planDigest,
            ),
        ),
});
