import type { ProviderDispatchPreparation } from "@bernouy/cms-gateway/protocol";

/** The actor is asserted by the authenticated Edge control connection, never by capability input. */
export function assertPreparationScope(input: ProviderDispatchPreparation): void {
    const { actor, invocation } = input;
    const denied = () => {
        throw Object.assign(new Error("Dispatch actor scope is invalid"), { status: 403 });
    };
    const allowed =
        actor.kind === "anonymous"
            ? ["kind"]
            : actor.kind === "user" || actor.kind === "administrator"
              ? ["kind", "subjectId", "authorizationRevision"]
              : actor.kind === "provider"
                ? ["kind", "installationId", "credentialFingerprint"]
                : actor.kind === "system"
                  ? ["kind", "serviceId"]
                  : [];
    if (
        !allowed.length ||
        Object.keys(actor).some((key) => !allowed.includes(key)) ||
        !Number.isSafeInteger(input.deadline) ||
        input.deadline <= Date.now()
    ) {
        denied();
    }
    if ("subjectId" in invocation || "delegation" in invocation || "actorKind" in invocation) {
        denied();
    }
    if (actor.kind === "provider") {
        if (
            invocation.sourceInstallationId !== actor.installationId ||
            invocation.sourceCredentialFingerprint !== actor.credentialFingerprint ||
            invocation.delegatedTicket
        ) {
            denied();
        }
    } else if (actor.kind === "system") {
        if (
            actor.serviceId !== invocation.systemServiceId ||
            invocation.sourceInstallationId ||
            input.expectedSubjectId
        ) {
            denied();
        }
    } else {
        if (invocation.systemServiceId || (invocation.sourceInstallationId && !invocation.delegatedTicket)) {
            denied();
        }
        if (
            (actor.kind === "user" || actor.kind === "administrator") &&
            (typeof actor.subjectId !== "string" ||
                !actor.subjectId ||
                !Number.isSafeInteger(actor.authorizationRevision))
        ) {
            denied();
        }
        if (actor.kind === "anonymous" && input.expectedSubjectId) {
            denied();
        }
    }
}
