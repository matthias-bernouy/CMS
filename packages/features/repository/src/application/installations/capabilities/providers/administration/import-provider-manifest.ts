import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    importProviderManifestInputSchema,
    importProviderManifestOutputSchema,
} from "repository/application/installations/schemas/providers/administration/import-provider-manifest";
import { approveProviderConnectionErrors as errors } from "repository/application/installations/schemas/common/failures";
import { administration, importManifest } from "repository/application/installations/core/providers/administration";
import { actor } from "repository/application/installations/core/gateway/requirements";
export const importProviderManifest = defineCapability({
    id: "import-provider-manifest",
    description: "import provider manifest",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/providers/import",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: importProviderManifestInputSchema,
    output: importProviderManifestOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        actor(context);
        return importManifest(administration(services), input);
    },
});
