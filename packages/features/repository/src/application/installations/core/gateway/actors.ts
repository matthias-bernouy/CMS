import type {
    GatewayDispatchPrepareInput,
    GatewayDelegationIssueInput,
} from "repository/application/installations/interfaces/inputs";
import type { DelegationSource } from "@bernouy/cms-gateway/access/delegation";
import type { ProviderDispatchPreparation } from "@bernouy/cms-gateway/protocol";
import { InstallationError } from "repository/application/installations/core/errors";
export function delegationActor(actor: GatewayDelegationIssueInput["source"]["actor"]): DelegationSource["actor"] {
    if (actor.kind === "anonymous") {
        return { kind: actor.kind };
    }
    if (!actor.subjectId) {
        throw new InstallationError("INVALID_INPUT");
    }
    return { kind: actor.kind, subjectId: actor.subjectId, authorizationRevision: actor.authorizationRevision };
}
export function gatewayActor(actor: GatewayDispatchPrepareInput["actor"]): ProviderDispatchPreparation["actor"] {
    if (actor.kind === "anonymous") {
        return { kind: actor.kind };
    }
    if (actor.kind === "user" || actor.kind === "administrator") {
        if (!actor.subjectId) {
            throw new InstallationError("INVALID_INPUT");
        }
        return { kind: actor.kind, subjectId: actor.subjectId, authorizationRevision: actor.authorizationRevision };
    }
    if (actor.kind === "system") {
        if (!actor.serviceId) {
            throw new InstallationError("INVALID_INPUT");
        }
        return { kind: actor.kind, serviceId: actor.serviceId };
    }
    if (!actor.installationId || !actor.credentialFingerprint) {
        throw new InstallationError("INVALID_INPUT");
    }
    return {
        kind: actor.kind,
        installationId: actor.installationId,
        credentialFingerprint: actor.credentialFingerprint,
    };
}
