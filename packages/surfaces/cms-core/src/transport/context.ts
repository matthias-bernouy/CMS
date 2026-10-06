import type { CoreCapabilityInvocationContext } from "@bernouy/cms-content";

export function coreInvocationContext(request: Request): CoreCapabilityInvocationContext {
    const requestId = requiredHeader(request, "x-ulvia-request-id", /^[0-9a-f-]{36}$/u);
    const siteId = requiredHeader(request, "x-ulvia-site-id", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
    const installationId = requiredHeader(request, "x-ulvia-installation-id", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
    const origin = requiredHeader(request, "x-ulvia-origin", /^(delivery|page|control|provider|system|conformance)$/u);
    const actorKind = requiredHeader(
        request,
        "x-ulvia-actor-kind",
        /^(anonymous|user|administrator|provider|system)$/u,
    );
    const providerSubjectId = optionalHeader(request, "x-ulvia-subject-id", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
    const idempotencyKey = optionalHeader(request, "idempotency-key", /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
    return {
        requestId,
        siteId,
        installationId,
        origin: origin as CoreCapabilityInvocationContext["origin"],
        actorKind: actorKind as CoreCapabilityInvocationContext["actorKind"],
        ...(providerSubjectId ? { providerSubjectId } : {}),
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
