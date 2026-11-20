import { parseConfiguration } from "repository/application/installations/core/collections/configuration";
import { ProviderCommandPreparationFailure } from "@bernouy/cms-gateway/protocol";
import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { mapInstallationError } from "repository/application/installations/capabilities/policy/mapError";
import { gatewayActor } from "repository/application/installations/core/gateway/actors";
import { auditSchema } from "repository/application/installations/core/gateway/routing";
import { InstallationError } from "repository/application/installations/core/errors";
import { required, requiredGateway, control } from "repository/application/installations/core/gateway/requirements";
import { gatewayRouteGetErrors as errors } from "repository/application/installations/schemas/common/failures";
import {
    gatewayCommandPrepareInputSchema,
    gatewayCommandPrepareOutputSchema,
} from "repository/application/installations/schemas/gateway/invocation/gateway.command.prepare";
import { gatewayDispatchPrepare } from "./gateway.dispatch.prepare";

const statuses: Readonly<Record<string, number>> = {
    INVALID_INPUT: 422,
    NOT_FOUND: 404,
    CORE_UNAVAILABLE: 503,
    FORBIDDEN: 403,
    RATE_LIMITED: 429,
    REVISION_CONFLICT: 409,
    INVALID_SELECTION: 422,
};
export const gatewayCommandPrepare = defineCapability({
    id: "gateway.command.prepare",
    description: "Edge control only. Resolve command identity, persist its start and prepare one invocation in order.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/gateway/commands/prepare",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503, FORBIDDEN: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayCommandPrepareInputSchema,
    output: gatewayCommandPrepareOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        const gateway = requiredGateway(services.gateway);
        let event;
        try {
            event = auditSchema.parse(parseConfiguration(input.commandStart.event));
        } catch {
            throw new InstallationError("FORBIDDEN");
        }
        if (
            event.stage !== "started" ||
            event.siteId !== gateway.siteId ||
            event.requestId !== input.invocation.requestId ||
            event.installationId !== input.invocation.installationId ||
            event.contractId !== input.invocation.contractId ||
            event.capabilityId !== input.invocation.capabilityId ||
            event.actorKind !== input.actor.kind ||
            event.actorSubjectId !== input.actor.subjectId ||
            event.status !== undefined ||
            event.errorCode !== undefined
        ) {
            throw new InstallationError("FORBIDDEN");
        }
        try {
            const prepared = await required(gateway.invocations.prepareCommand)({
                ...input,
                actor: gatewayActor(input.actor),
                commandStart: { ...input.commandStart, event },
            });
            return { prepared, failure: null };
        } catch (error) {
            if (!(error instanceof ProviderCommandPreparationFailure)) {
                throw error;
            }
            const mapped = mapInstallationError(error.cause, gatewayDispatchPrepare);
            return { prepared: null, failure: { stage: error.stage, status: statuses[mapped?.code ?? ""] ?? 503 } };
        }
    },
});
