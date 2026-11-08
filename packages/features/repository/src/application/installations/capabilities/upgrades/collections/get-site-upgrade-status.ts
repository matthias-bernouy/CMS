import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { emptyInputSchema } from "repository/application/installations/schemas/common/input";
import { getSiteUpgradeStatusOutputSchema } from "repository/application/installations/schemas/upgrades/collections/get-site-upgrade-status";
import { capabilitiesDescribeErrors as errors } from "repository/application/installations/schemas/common/failures";
import { siteUpgradeStatus } from "repository/application/installations/core/collections/queries";
export const getSiteUpgradeStatus = defineCapability({
    id: "get-site-upgrade-status",
    access: "admin",
    description: "Read the active site release-switch intent and its maintenance fence.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/get-site-upgrade-status",
            input: {},
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: { name: "installations_get_site_upgrade_status", description: "get collection upgrade status" },
        },
    ],
    docs: ["overview.md"],
    input: emptyInputSchema,
    output: getSiteUpgradeStatusOutputSchema,
    errors,
    execute: async ({ services, context }) => siteUpgradeStatus(services.collectionUpgrades, context.siteId),
});
