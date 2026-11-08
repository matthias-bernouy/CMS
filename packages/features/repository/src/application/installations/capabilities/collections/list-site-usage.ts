import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    listSiteUsageInputSchema,
    listSiteUsageOutputSchema,
} from "repository/application/installations/schemas/collections/list-site-usage";
import { listSiteUsageErrors as errors } from "repository/application/installations/schemas/common/failures";
import { siteUsage } from "repository/application/installations/core/collections/queries";
export const listSiteUsage = defineCapability({
    id: "list-site-usage",
    access: "admin",
    description:
        "Read a bounded site usage inventory with catalogue and runtime scopes, resource locations and capability consumers. The cursor pins an exact inventory digest and becomes invalid after any analysed revision changes.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/list-site-usage",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503, INVALID_INPUT: 422, REVISION_CONFLICT: 409 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_list_site_usage",
                description:
                    "Read a bounded site usage inventory with catalogue and runtime scopes, resource locations and capability consumers. The cursor pins an exact inventory digest and becomes invalid after any analysed revision changes.",
            },
        },
    ],
    docs: ["overview.md"],
    input: listSiteUsageInputSchema,
    output: listSiteUsageOutputSchema,
    errors,
    execute: async ({ services, input, context }) => siteUsage(services.collectionUpgrades, context.siteId, input),
});
