import type { GatewayActor, GatewayResult } from "@bernouy/cms-gateway";
import { parseResourceMetadata } from "@bernouy/cms-gateway/protocol";
import { buildCspContent, securityHeaders, prepareStreamingResponse, type CspExtras } from "@bernouy/http-runner";

export interface ResourceResponsePolicy {
    readonly csp?: CspExtras;
    readonly reportOnly?: boolean;
}
export async function resourceHttpResponse(
    result: GatewayResult,
    request: Request,
    actor: GatewayActor,
    policy: ResourceResponsePolicy = {},
): Promise<Response> {
    if (result.kind !== "binary" || !result.resource) {
        throw new TypeError("Expected a native resource result");
    }
    let metadata;
    try {
        metadata = parseResourceMetadata(result.resource);
    } catch (error) {
        await result.stream.cancel();
        throw error;
    }
    const headers = new Headers(metadata.headers);
    const status = metadata.status;
    const cache = headers.get("cache-control");
    headers.set("cache-control", actor.kind !== "anonymous" ? "private, no-store" : safeCachePolicy(cache));
    for (const [name, value] of Object.entries(securityHeaders())) {
        headers.set(name, value);
    }
    if (headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
        headers.set("x-frame-options", "SAMEORIGIN");
        const csp = buildCspContent(policy.csp, { includeHeaderOnlyDirectives: false }) + "; frame-ancestors 'self'";
        headers.set(policy.reportOnly ? "content-security-policy-report-only" : "content-security-policy", csp);
    }
    if (!headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
        headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    headers.set(
        "vary",
        [
            ...new Set([
                "Accept",
                "Accept-Language",
                ...(metadata.vary ?? []).filter(
                    (name) => name !== "accept" && name !== "accept-language" && name !== "accept-encoding",
                ),
                "Accept-Encoding",
            ]),
        ].join(", "),
    );
    const bodyless = request.method === "HEAD" || status === 304 || [301, 302, 303, 307, 308].includes(status);
    if (bodyless) {
        // The Provider sends an empty native wire body for HEAD/304. Consume EOF so
        // invocation observations and delegation lifetime complete normally.
        const reader = result.stream.getReader();
        try {
            const part = await reader.read();
            if (!part.done) {
                await reader.cancel();
                throw new TypeError("Bodyless resource carried bytes");
            }
        } finally {
            reader.releaseLock();
        }
        return new Response(null, { status, headers });
    }
    return prepareStreamingResponse(request, new Response(result.stream, { status, headers }));
}

function safeCachePolicy(value: string | null): string {
    if (!value || value.length > 256 || /(?:private|no-store)/iu.test(value)) {
        return "no-store";
    }
    const parts = value.split(",").map((part) => part.trim().toLowerCase());
    if (
        parts.some(
            (part) =>
                !/^(?:public|no-cache|must-revalidate|immutable|(?:max-age|s-maxage|stale-while-revalidate|stale-if-error)=(?:0|[1-9][0-9]{0,7}))$/u.test(
                    part,
                ),
        )
    ) {
        return "no-store";
    }
    if (
        parts.some(
            (part) =>
                /^(?:max-age|s-maxage|stale-while-revalidate|stale-if-error)=/u.test(part) &&
                Number(part.split("=")[1]) > 31536000,
        )
    ) {
        return "no-store";
    }
    if (new Set(parts.map((part) => part.split("=")[0])).size !== parts.length) {
        return "no-store";
    }
    return parts.filter((part) => !part.startsWith("s-maxage=")).join(", ");
}
