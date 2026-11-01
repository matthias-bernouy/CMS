import type { GatewayHttpInvoker } from "@bernouy/cms-gateway/http";
import { ResponseCache } from "./cache/ResponseCache";
import { isPublicContentAsset } from "./publicContentAssets";
import { resolveDeliveryContract } from "./deliveryContract";
import { GatewayError, type GatewayActor, type GatewayInvoker } from "@bernouy/cms-gateway";
import { resourceHttpResponse, type ResourceResponsePolicy } from "@bernouy/cms-edge";

export function createPublicResourceHandler(
    gateway: GatewayInvoker & Partial<Pick<GatewayHttpInvoker, "resolveContract">>,
    policy: ResourceResponsePolicy = {},
    cache = new ResponseCache({ enabled: false }),
) {
    return async (request: Request, actor: GatewayActor): Promise<Response> => {
        // These resources are already anonymously readable and contain no Page/user projection.
        // Deliver them under anonymous authority so cookies cannot poison their cache policy.
        if (isPublicContentAsset(request)) {
            actor = { kind: "anonymous" };
        }
        return cache.handle(
            request,
            async (request, cacheFill) => {
                try {
                    const context = readGatewayRequestContext(request, true);
                    const contract = await resolveDeliveryContract(gateway);
                    const selected = publicDeliveryInvocation(request, contract, cacheFill);
                    const result = await gateway.invoke({
                        siteId: "default",
                        contractId: contract?.release.contractId ?? "ulvia.cms.content",
                        ...selected,
                        actor,
                        requestContext: context,
                        signal: request.signal,
                    });
                    return {
                        response: await resourceHttpResponse(result, request, actor, policy),
                        tags: result.kind === "binary" ? result.resource?.cacheTags : undefined,
                        cacheControl:
                            result.kind === "binary" ? (result.resource?.headers["cache-control"] ?? null) : null,
                    };
                } catch (error) {
                    if (error instanceof GatewayError && error.code === "invalid_input") {
                        return {
                            response: new Response("Invalid public path request", {
                                status: 400,
                                headers: { "cache-control": "no-store" },
                            }),
                            cacheControl: null,
                        };
                    }
                    throw error;
                }
            },
            actor.kind === "anonymous",
        );
    };
}
import { publicDeliveryInvocation } from "./publicDeliveryInvocation";
import { readGatewayRequestContext } from "@bernouy/cms-gateway/http/handlers";
