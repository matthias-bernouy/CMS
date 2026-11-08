import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    setProviderStatusInputSchema,
    setProviderStatusOutputSchema,
} from "repository/application/installations/schemas/providers/reads/set-provider-status";
import { setProviderStatusErrors as errors } from "repository/application/installations/schemas/common/failures";
import { requiredManagement } from "repository/application/installations/core/requirements";
export const setProviderStatus = defineCapability({
    id: "set-provider-status",
    description: "Enable, disable or terminally revoke one provider installation with revision control.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/set-provider-status",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
                    INVALID_STATE: 409,
                    REVISION_CONFLICT: 409,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: setProviderStatusInputSchema,
    output: setProviderStatusOutputSchema,
    errors,
    execute: async ({ services, input }) =>
        requiredManagement(services.management).setStatus({
            installationId: input.installationId,
            revision: input.expectedRevision,
            action: input.action,
        }),
});
