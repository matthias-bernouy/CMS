import type { ProviderKernelTransport } from "./ProviderKernelTransport";
import type { Logger } from "@bernouy/logging";
import { currentRequestHeaders } from "@bernouy/http-runner/observability";

export class ProviderKernelClient {
    constructor(
        private readonly transport: ProviderKernelTransport,
        private readonly logger: Logger,
    ) {}

    collectionAsset = (request: Request): Promise<Response> =>
        this.forward(
            `/ulvia/kernel/v1/collections${new URL(request.url).pathname.slice("/.cms/collections".length)}${new URL(request.url).search}`,
            request,
        );

    sitemap = (request: Request): Promise<Response> => this.forwardSitemap(request);

    private async forward(
        path: string,
        request: Request,
        extraHeaders?: HeadersInit,
        timeoutMs?: number,
    ): Promise<Response> {
        const response = await this.transport.forward(path, request, currentRequestHeaders(extraHeaders), timeoutMs);
        if (!response.ok) {
            this.logger.warn("provider.proxy.failed", {
                path: path.split("?")[0],
                status: response.status,
            });
        }
        return this.transport.response(response);
    }

    private forwardSitemap(request: Request): Promise<Response> {
        const path = new URL(request.url).pathname;
        return this.forward("/ulvia/kernel/v1/sitemap/resource", request, { "x-ulvia-original-path": path });
    }
}
