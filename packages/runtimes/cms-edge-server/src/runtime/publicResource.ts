import { isPublicContentAsset } from "./publicContentAssets";
import { GatewayError, type GatewayActor, type GatewayInvoker } from "@bernouy/cms-gateway";
import { resourceHttpResponse, type ResourceResponsePolicy } from "@bernouy/cms-edge";

export function createPublicResourceHandler(gateway: GatewayInvoker, policy: ResourceResponsePolicy = {}) {
    return async (request: Request, actor: GatewayActor): Promise<Response> => {
        // These resources are already anonymously readable and contain no Page/user projection.
        // Deliver them under anonymous authority so cookies cannot poison their cache policy.
        if (isPublicContentAsset(request)) {
            actor = { kind: "anonymous" };
        }
        const url = new URL(request.url);
        const headers = request.headers;
        let range: ReturnType<typeof parseRange>;
        try {
            range = parseRange(headers.get("range"));
        } catch {
            return new Response("Invalid byte range", { status: 400, headers: { "cache-control": "no-store" } });
        }
        try {
            const result = await gateway.invoke({
                siteId: "default",
                contractId: "ulvia.cms.content",
                capabilityId: "delivery.resolve-path",
                actor,
                input: {
                    path: url.pathname,
                    method: request.method,
                    query: [...url.searchParams].map(([name, value]) => ({ name, value })),
                    ...(headers.has("accept") ? { accept: headers.get("accept")! } : {}),
                    ...(headers.has("accept-language") ? { acceptLanguage: headers.get("accept-language")! } : {}),
                    ...(headers.has("if-none-match")
                        ? { ifNoneMatch: headers.get("if-none-match")!.replace(/^W\//u, "") }
                        : {}),
                    ...(headers.has("if-range") ? { ifRange: headers.get("if-range")! } : {}),
                    ...(range ? { range } : {}),
                },
            });
            return await resourceHttpResponse(result, request, actor, policy);
        } catch (error) {
            if (error instanceof GatewayError && error.code === "invalid_input") {
                return new Response("Invalid public path request", {
                    status: 400,
                    headers: { "cache-control": "no-store" },
                });
            }
            throw error;
        }
    };
}
function parseRange(value: string | null): { start?: number; end?: number } | undefined {
    if (value === null) {
        return undefined;
    }
    const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
    if (
        !match ||
        (!match[1] && !match[2]) ||
        [match[1], match[2]].some((part) => part && !Number.isSafeInteger(Number(part)))
    ) {
        throw new TypeError("Unsupported byte range");
    }
    return { ...(match[1] ? { start: Number(match[1]) } : {}), ...(match[2] ? { end: Number(match[2]) } : {}) };
}
