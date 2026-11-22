import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    selectContractInputSchema,
    selectContractOutputSchema,
} from "repository/application/installations/schemas/providers/reads/select-contract";
import { gatewayAuditAppendInvalidinputErrorSchema as output } from "repository/application/installations/schemas/common/errors";
import { actor, required, requiredManagement } from "repository/application/installations/core/gateway/requirements";
const errors = {
    INVALID_INPUT: { retryable: false, output },
    FORBIDDEN: { retryable: false, output },
    REVISION_CONFLICT: { retryable: false, output },
    INVALID_SELECTION: { retryable: false, output },
    CORE_UNAVAILABLE: { retryable: true, output },
};
export const selectContract = defineCapability({
    id: "select-contract",
    description:
        "Select one exact, approved and ready Provider contract, preserving unrelated selections and validating implementation dependencies.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    input: selectContractInputSchema,
    output: selectContractOutputSchema,
    errors,
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/select-contract",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    FORBIDDEN: 403,
                    REVISION_CONFLICT: 409,
                    INVALID_SELECTION: 409,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        { id: "mcp", transport: "mcp" },
    ],
    docs: ["overview.md"],
    execute: ({ input, services, context }) => {
        actor(context);
        const management = requiredManagement(services.management);
        return required(management.selectContract?.bind(management))(input);
    },
});
