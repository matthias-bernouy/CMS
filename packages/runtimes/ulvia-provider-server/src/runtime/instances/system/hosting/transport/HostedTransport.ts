import { isIP } from "node:net";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import type { NodeGatewayHttpNetworkFactory } from "@bernouy/cms-gateway/http/node";
import type { RepositoryFetch } from "@bernouy/repository/providers/http";
import type { HostingDomainStore, HostingInstanceReader } from "@bernouy/hosting";
import { retainResponseResource } from "@bernouy/http-runner";

/** Dial an operator-owned HTTP pool while retaining the registered public authority and admitted bindings. */
export class HostedTransport {
    private pending = 0;
    private readonly proxy: URL;
    constructor(
        proxyOrigin: string,
        private readonly domains: Pick<HostingDomainStore, "getDomain">,
        private readonly instances: HostingInstanceReader,
        private readonly fetcher: RepositoryFetch = fetch,
        private readonly maxPending = 64,
    ) {
        this.proxy = privateProxyOrigin(proxyOrigin);
        if (!Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 256) {
            throw new TypeError("Invalid hosted transport concurrency bound");
        }
    }

    readonly request: RepositoryFetch = (url, init) =>
        this.response(async () => {
            const hosted = await this.isHosted(url.origin);
            init.signal?.throwIfAborted();
            if (!hosted) {
                return this.fetcher(url, { ...init, redirect: "manual" });
            }
            const headers = new Headers(init.headers);
            headers.set("host", url.host);
            return this.fetcher(new URL(`${url.pathname}${url.search}`, this.proxy), {
                ...init,
                headers,
                redirect: "manual",
            });
        }, init.signal ?? undefined);

    readonly network: NodeGatewayHttpNetworkFactory = (options) => {
        const external = new NodeGatewayHttpNetwork(options);
        return {
            exchange: (request) =>
                this.response(async () => {
                    if (!(await this.isHosted(request.origin))) {
                        return external.exchange(request);
                    }
                    // Authorization still binds the original selected endpoint. Only the trusted socket
                    // destination changes, and the ordinary Node adapter validates headers, path and DNS.
                    const privateNetwork = new NodeGatewayHttpNetwork({
                        ...options,
                        ...(options.authorize ? { authorize: () => options.authorize!(request) } : {}),
                        sendPinned: (pinned) => {
                            const url = new URL(pinned.url);
                            url.hostname =
                                pinned.address.family === 6 ? `[${pinned.address.address}]` : pinned.address.address;
                            return this.fetcher(url, {
                                method: pinned.method,
                                headers: { ...pinned.headers, host: new URL(request.origin).host },
                                ...(pinned.body === undefined ? {} : { body: pinned.body }),
                                signal: pinned.signal,
                                redirect: "manual",
                            });
                        },
                    });
                    return privateNetwork.exchange({ ...request, origin: this.proxy.origin });
                }, request.signal),
        };
    };

    private async isHosted(origin: string): Promise<boolean> {
        const url = new URL(origin);
        if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) {
            throw new TypeError("Invalid logical hosting origin");
        }
        if (isIP(url.hostname.replace(/^\[|\]$/gu, ""))) {
            return false;
        }
        const domain = await this.domains.getDomain(url.hostname.toLowerCase().replace(/\.$/u, ""));
        if (!domain) {
            return false;
        }
        if (domain.origin !== origin || domain.state !== "active") {
            throw new Error("Hosted origin is not active at its registered authority");
        }
        const instance = await this.instances.getInstance(domain.instanceId);
        if (instance?.status !== "ready" || instance.id !== domain.instanceId) {
            throw new Error("Hosted instance is not ready");
        }
        return true;
    }
    private async response(task: () => Promise<Response>, signal?: AbortSignal) {
        signal?.throwIfAborted();
        if (this.pending >= this.maxPending) {
            throw new Error("Hosted transport capacity is exhausted");
        }
        this.pending++;
        try {
            const response = await task();
            return retainResponseResource(
                response,
                () => {
                    this.pending--;
                },
                signal,
            );
        } catch (cause) {
            this.pending--;
            throw cause;
        }
    }
}
export function privateProxyOrigin(value: string): URL {
    const url = new URL(value);
    if (value.length > 2048 || url.origin !== value || url.protocol !== "http:") {
        throw new TypeError("ULVIA_HOSTING_PROXY_URL must be an explicit private HTTP origin");
    }
    return url;
}
