import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import { emptyInputSchema } from "cms-repository/application/installations/schemas/common/input";
import { listProviderInstallationsOutputSchema } from "cms-repository/application/installations/schemas/providers/reads/list-provider-installations";
import { capabilitiesDescribeErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { providerInstallations } from "cms-repository/application/installations/core/providers/reads";
export const listProviderInstallations = defineCapability({
    id: "list-provider-installations",
    description: "List approved provider installations and their selectable contract routes.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/list-provider-installations",
            input: {},
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: emptyInputSchema,
    output: listProviderInstallationsOutputSchema,
    errors,
    execute: async ({ services }) => providerInstallations(services.gateway),
});
