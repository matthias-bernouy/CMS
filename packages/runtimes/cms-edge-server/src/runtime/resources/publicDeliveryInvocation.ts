import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import { GatewayError } from "@bernouy/cms-gateway";

/** Selection is based on an admitted capability, never a guessed contract version. */
export function publicDeliveryInvocation(request: Request, contract?: AdmittedContractRelease, cacheFill = false) {
    const modern = contract?.release.capabilities.some(({ id }) => id === "delivery.resolve-resource");
    const url = new URL(request.url);
    const input: Record<string, unknown> = {
        path: url.pathname,
        method: request.method,
        query: [...url.searchParams].map(([name, value]) => ({ name, value })),
    };
    if (modern) {
        return { capabilityId: "delivery.resolve-resource", input };
    }
    const extended = contract?.release.capabilities.find(({ id }) => id === "delivery.resolve-path")?.input.properties
        .resourceMetadata;
    if (cacheFill && extended?.type === "string" && extended.enum?.includes("cache-v1")) {
        input.resourceMetadata = "cache-v1";
    }
    for (const [header, name] of [
        ["accept", "accept"],
        ["accept-language", "acceptLanguage"],
        ["if-none-match", "ifNoneMatch"],
        ["if-range", "ifRange"],
    ] as const) {
        const value = request.headers.get(header);
        if (value !== null) {
            input[name] = value;
        }
    }
    const range = parseLegacyRange(request.headers.get("range"));
    if (range) {
        input.range = range;
    }
    return { capabilityId: "delivery.resolve-path", input };
}
function parseLegacyRange(value: string | null): { start?: number; end?: number } | undefined {
    if (value === null) {
        return undefined;
    }
    const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
    if (
        !match ||
        (!match[1] && !match[2]) ||
        [match[1], match[2]].some((part) => part && !Number.isSafeInteger(Number(part)))
    ) {
        throw new GatewayError("invalid_input", "Unsupported legacy byte range");
    }
    return { ...(match[1] ? { start: Number(match[1]) } : {}), ...(match[2] ? { end: Number(match[2]) } : {}) };
}
