import { GatewayProviderClient } from "@bernouy/cms-gateway/provider/node";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { isolatedOrigin } from "../../../harness/transport/http";

/** Send real SDK JSON commands through the owned loopback ingress while preserving the tenant's Host. */
export function loopbackProviderClient(cmsUrl: string, token: string) {
    const origin = isolatedOrigin(cmsUrl);
    const hostname = new URL(origin).hostname;
    if (!hostname.endsWith(".localhost") || new URL(origin).protocol !== "http:") {
        throw new Error("Provider return-channel fixtures require an HTTP loopback tenant");
    }
    const ingress = new URL(origin);
    ingress.hostname = "127.0.0.1";
    return new GatewayProviderClient({
        cmsUrl: ingress.origin,
        token,
        allowPrivateAddresses: true,
        createNetwork: (options) =>
            new NodeGatewayHttpNetwork({
                ...options,
                sendPinned: async (request) => {
                    if (
                        request.url.origin !== ingress.origin ||
                        request.address.address !== "127.0.0.1" ||
                        request.method !== "POST" ||
                        typeof request.body !== "string"
                    ) {
                        throw new Error("Provider fixture ingress scope mismatch");
                    }
                    return fetch(request.url, {
                        method: request.method,
                        body: request.body,
                        headers: { ...request.headers, host: new URL(origin).host },
                        signal: request.signal,
                        redirect: "manual",
                    });
                },
            }),
    });
}
