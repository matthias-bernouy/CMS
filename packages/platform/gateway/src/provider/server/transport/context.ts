import type { ProviderCapabilityInvocationContext } from "../dispatch/registry";
import type { ProviderInvocationClaims } from "cms-gateway/protocol/ProviderInvocationToken";
import { ACTOR_CREDENTIAL_HEADER, decodeActorCredential } from "cms-gateway/protocol/TrustedCapabilityEffects";
import { hydrateProviderInvocationContext } from "../dispatch/httpContext";

export function providerInvocationContext(
    request: Request,
    claims: ProviderInvocationClaims,
    scope: { readonly siteId: string; readonly providerId: string },
    controlAuthority = false,
): ProviderCapabilityInvocationContext {
    const requestId = requiredHeader(request, "x-ulvia-request-id", /^[0-9a-f-]{36}$/u);
    if (requestId !== claims.requestId) {
        throw new TypeError("Invocation request ID does not match its signed claim.");
    }
    const idempotencyKey = optionalHeader(request, "idempotency-key", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
    const encodedCredential = request.headers.get(ACTOR_CREDENTIAL_HEADER);
    if (
        encodedCredential !== null &&
        (claims.contractId !== "ulvia/cms.access" || !["resolve-actor", "logout"].includes(claims.capabilityId))
    ) {
        throw new TypeError("Actor credentials are restricted to Access resolution and logout.");
    }
    const actorCredential = decodeActorCredential(encodedCredential);
    const metadata = decodeRequestContext(request.headers.get(REQUEST_CONTEXT_HEADER)) ?? requestContext(request);
    return hydrateProviderInvocationContext({
        http: {
            headers: new Headers(metadata.headers),
            transportRequest: request,
            ...(metadata.resource ? { resource: metadata.resource } : {}),
        },
        requestContext: metadata,
        signal: request.signal,
        requestId,
        ...(claims.trace ? { trace: claims.trace } : {}),
        ...(claims.actorKind ? { actorKind: claims.actorKind } : {}),
        ...(claims.delegationTicket
            ? { delegation: { ticket: claims.delegationTicket, expiresAt: claims.delegationExpiresAt! } }
            : {}),
        ...(claims.rootRequestId ? { rootRequestId: claims.rootRequestId } : {}),
        contractVersion: claims.contractVersion,
        siteId: scope.siteId,
        ...(claims.connectionId ? { connectionId: claims.connectionId } : {}),
        providerId: scope.providerId,
        ...(claims.subjectId ? { subjectId: claims.subjectId } : {}),
        ...(claims.systemServiceId ? { systemServiceId: claims.systemServiceId } : {}),
        ...(claims.sourceInstallationId ? { sourceInstallationId: claims.sourceInstallationId } : {}),
        ...(controlAuthority ? { controlAuthority: true as const } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(actorCredential ? { actorCredential } : {}),
    });
}

function requiredHeader(request: Request, name: string, pattern: RegExp): string {
    const value = optionalHeader(request, name, pattern);
    if (!value) {
        throw new TypeError(`Missing trusted ${name} header.`);
    }
    return value;
}

function optionalHeader(request: Request, name: string, pattern: RegExp): string | undefined {
    const value = request.headers.get(name);
    if (value === null) {
        return undefined;
    }
    if (!pattern.test(value)) {
        throw new TypeError(`Invalid trusted ${name} header.`);
    }
    return value;
}

import { REQUEST_CONTEXT_HEADER, decodeRequestContext, requestContext } from "cms-gateway/protocol/http/requestContext";
