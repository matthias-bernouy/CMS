import { z } from "zod";
import type { GatewayCommandAuditEvent } from "@bernouy/cms-gateway/audit";
import type { InstallationGateway } from "repository/application/installations/interfaces/gateway";
import type { GatewayIdentityResolveInput } from "repository/application/installations/interfaces/inputs";
import { parseConfiguration } from "repository/application/installations/core/collections/configuration";
import { InstallationError } from "repository/application/installations/core/errors";
const auditSchema = z.strictObject({
    id: z.string(),
    requestId: z.string(),
    occurredAt: z.string(),
    siteId: z.string(),
    installationId: z.string(),
    contractId: z.string(),
    capabilityId: z.string(),
    actorKind: z.enum(["anonymous", "user", "administrator", "system", "provider"]),
    stage: z.enum(["started", "rejected", "completed", "declared-error", "outcome-unknown"]),
    actorSubjectId: z.string().optional(),
    status: z.int().optional(),
    errorCode: z.string().optional(),
});
export async function route(gateway: InstallationGateway, contractId: string) {
    const value = await gateway.routes.resolve(gateway.siteId, contractId);
    if (!value) {
        throw new InstallationError("NOT_FOUND");
    }
    return { route: JSON.stringify(value) };
}
export async function resolveIdentity(gateway: InstallationGateway, input: GatewayIdentityResolveInput) {
    return {
        providerSubjectId: await gateway.identities.getOrCreate({ providerId: input.providerId }, input.subjectId),
    };
}
export async function appendAudit(gateway: InstallationGateway, value: string) {
    let raw: unknown;
    try {
        raw = parseConfiguration(value);
    } catch (cause) {
        throw new InstallationError("INVALID_INPUT", cause);
    }
    const parsed = auditSchema.safeParse(raw);
    if (!parsed.success) {
        throw new InstallationError("INVALID_INPUT");
    }
    const event: GatewayCommandAuditEvent = parsed.data;
    try {
        await gateway.commandAudit.append(event);
    } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || Number(error.code) !== 11000) {
            throw error;
        }
    }
    return { accepted: true };
}
