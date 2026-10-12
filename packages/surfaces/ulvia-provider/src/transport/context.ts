import type { ProviderCapabilityInvocationContext } from "../dispatch/registry";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";

export function providerInvocationContext(
    request: Request,
    claims: ProviderInvocationClaims,
    scope: { readonly siteId: string; readonly providerId: string },
): ProviderCapabilityInvocationContext {
    const requestId = requiredHeader(request, "x-ulvia-request-id", /^[0-9a-f-]{36}$/u);
    if (requestId !== claims.requestId) {
        throw new TypeError("Invocation request ID does not match its signed claim.");
    }
    const idempotencyKey = optionalHeader(request, "idempotency-key", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
    return {
        requestId,
        contractVersion: claims.contractVersion,
        siteId: scope.siteId,
        providerId: scope.providerId,
        ...(claims.subjectId ? { subjectId: claims.subjectId } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
    };
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
