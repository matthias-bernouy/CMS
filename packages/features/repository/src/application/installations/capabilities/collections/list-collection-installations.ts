import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { installCollectionOutputSchema } from "repository/application/installations/schemas/collections/install-collection";
import { emptyInputSchema } from "repository/application/installations/schemas/common/input";
import { capabilitiesDescribeErrors as errors } from "repository/application/installations/schemas/common/failures";
export const listCollectionInstallations = defineCapability({
    id: "list-collection-installations",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/list-collection-installations",
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
            tool: {
                name: "installations_list_collection_installations",
                description:
                    "Read this site’s installed collection versions and current installation revision before installing or upgrading.",
            },
        },
    ],
    docs: ["overview.md"],
    input: emptyInputSchema,
    output: installCollectionOutputSchema,
    errors,
    execute: async ({ services, context }) => services.collections.listInstalled(context.siteId),
});
