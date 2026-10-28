import type { ProviderInvocationIssue } from "cms-gateway/protocol/ProviderInvocationToken";
import type { GatewayHttpExchange } from "./HttpGatewayTransport";

/** Convert trusted transport metadata, never authored binding fields, into a broker request. */
export function invocationAuthority(request: GatewayHttpExchange): ProviderInvocationIssue {
    if (request.authentication.kind !== "capability" || !request.installationId) {
        throw new TypeError("Invocation authority requires an exact installation and capability");
    }
    const authority = request.authentication;
    return {
        requestId: request.requestId,
        installationId: request.installationId,
        contractId: authority.contractId,
        contractVersion: authority.contractVersion,
        capabilityId: authority.capabilityId,
        ...(authority.subjectId ? { subjectId: authority.subjectId } : {}),
        ...(authority.systemServiceId ? { systemServiceId: authority.systemServiceId } : {}),
        ...(authority.sourceInstallationId
            ? {
                  sourceInstallationId: authority.sourceInstallationId,
                  sourceCredentialFingerprint:
                      authority.sourceCredentialFingerprint ?? request.delegated?.credentialFingerprint,
              }
            : {}),
        ...(authority.delegation ? { delegation: authority.delegation } : {}),
        ...(request.delegated ? { delegatedTicket: request.delegated.ticket } : {}),
        bodyBytes:
            request.contentLength ??
            (typeof request.body === "string"
                ? new TextEncoder().encode(request.body).byteLength
                : request.body
                  ? 64 * 1024 * 1024 + 1
                  : 0),
    };
}
