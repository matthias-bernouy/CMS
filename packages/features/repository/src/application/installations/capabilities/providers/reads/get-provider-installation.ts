import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    getProviderInstallationInputSchema,
    getProviderInstallationOutputSchema,
} from "repository/application/installations/schemas/providers/reads/get-provider-installation";
import { getCollectionInstallationErrors as errors } from "repository/application/installations/schemas/common/failures";
import { providerInstallation } from "repository/application/installations/core/providers/reads";
export const getProviderInstallation = defineCapability({
    id: "get-provider-installation",
    description: "Read one provider installation, its observed implementations and its selected contracts.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-provider-installation",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: getProviderInstallationInputSchema,
    output: getProviderInstallationOutputSchema,
    errors,
    execute: async ({ services, input }) => providerInstallation(services.gateway, input.installationId),
});
