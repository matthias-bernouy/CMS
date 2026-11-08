import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    gatewayAuditAppendInputSchema,
    gatewayAuditAppendOutputSchema,
} from "repository/application/installations/schemas/gateway/routing/gateway.audit.append";
import { gatewayAuditAppendErrors as errors } from "repository/application/installations/schemas/common/failures";
import { appendAudit } from "repository/application/installations/core/gateway/routing";
import { requiredGateway, control } from "repository/application/installations/core/requirements";
export const gatewayAuditAppend = defineCapability({
    id: "gateway.audit.append",
    description: "Edge control connection only. Persist one immutable Gateway command audit event.",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/gateway/audit",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503, FORBIDDEN: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayAuditAppendInputSchema,
    output: gatewayAuditAppendOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return appendAudit(requiredGateway(services.gateway), input.event);
    },
});
