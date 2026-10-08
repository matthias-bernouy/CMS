import type { CoreCapabilityInvocationContext } from "../dispatch/registry";

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
    const callChainId = optionalHeader(request, "x-ulvia-call-chain-id", /^[0-9a-f-]{36}$/u);
    const callDepthValue = optionalHeader(request, "x-ulvia-call-depth", /^[0-7]$/u);
    const callPath = parseCallPath(request.headers.get("x-ulvia-call-path"));
    if (Boolean(callChainId) !== Boolean(callDepthValue) || Boolean(callChainId) !== Boolean(callPath)) {
        throw new TypeError("Incomplete trusted provider call context.");
    }
    return {
        requestId,
        siteId,
        installationId,
        origin: origin as CoreCapabilityInvocationContext["origin"],
        actorKind: actorKind as CoreCapabilityInvocationContext["actorKind"],
        ...(callChainId
            ? {
                  callChainId,
                  callDepth: Number(callDepthValue),
                  callerInstallationId: callPath!.at(-2),
              }
            : {}),
        ...(providerSubjectId ? { providerSubjectId } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
    };
}

function parseCallPath(value: string | null): readonly string[] | undefined {
    if (value === null) {
        return undefined;
    }
    let decoded: unknown;
    try {
        decoded = JSON.parse(decodeURIComponent(value));
    } catch {
        throw new TypeError("Invalid trusted provider call path.");
    }
    if (
        !Array.isArray(decoded) ||
        decoded.length < 1 ||
        decoded.length > 8 ||
        decoded.some((id) => typeof id !== "string" || !id || id.length > 256)
    ) {
        throw new TypeError("Invalid trusted provider call path.");
    }
    return decoded;
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
