import { isIP } from "node:net";
import { getRequestIP, setRequestIP, retainResponseResource, requestId } from "@bernouy/http-runner";
import type { EdgeRoute } from "@bernouy/hosting/routing";
import type { Logger } from "@bernouy/logging";
import type { ContextPoolOptions } from "./ContextPool";
import { EdgeContextPool } from "./ContextPool";
import { routeContextKey } from "./client/RouteLease";

type Context = { handle(request: Request): Promise<Response>; update(route: EdgeRoute): void; close(): Promise<void> };

/** One socket, independently scoped tenant route trees, fresh routing before any resource cache. */
export class SharedEdge {
    private readonly contexts: EdgeContextPool<Context>;
    constructor(
        private readonly routing: { resolve(hostname: string): Promise<EdgeRoute | null> },
        create: (route: EdgeRoute) => Promise<Context>,
        private readonly logger: Logger,
        bounds: ContextPoolOptions,
    ) {
        this.contexts = new EdgeContextPool(
            async (key) => {
                const [hostname] = JSON.parse(key) as [string];
                const route = await routing.resolve(hostname);
                if (!route || routeContextKey(route) !== key) {
                    throw new Error("The hosting route changed while loading its context");
                }
                return create(route);
            },
            (context) => context.close(),
            bounds,
        );
    }
    snapshot() {
        return this.contexts.snapshot();
    }
    close() {
        return this.contexts.close();
    }

    async handle(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const host = request.headers.get("host");
        if (host && !matchingAuthority(host, url)) {
            return refusal(400);
        }
        const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
        if (!hostname || hostname.length > 253 || isIP(hostname) !== 0 || /[\s/@:#?\\]/u.test(hostname)) {
            return refusal(400);
        }
        try {
            const route = await this.routing.resolve(hostname);
            if (!route) {
                return refusal(404);
            }
            const origin = new URL(route.origin);
            const normalized = new URL(url);
            normalized.hostname = hostname;
            if (origin.hostname !== hostname || origin.host !== normalized.host) {
                return refusal(404);
            }
            // Admitted contract endpoints retain their original logical origin for
            // Provider callbacks and origin-bound Repository credentials. Public
            // pages and OAuth/MCP discovery still use the elected canonical host.
            const contractCall = url.pathname.startsWith("/.cms/call/");
            if ((!contractCall && route.canonicalOrigin !== route.origin) || url.host !== origin.host) {
                const canonical = new URL(route.canonicalOrigin);
                canonical.pathname = url.pathname;
                canonical.search = url.search;
                return new Response(null, {
                    status: 308,
                    headers: { location: canonical.href, "cache-control": "no-store" },
                });
            }
            const lease = await this.contexts.acquire(routeContextKey(route), request.signal);
            try {
                lease.context.update(route);
                origin.pathname = url.pathname;
                origin.search = url.search;
                const scoped = new Request(origin.href, request);
                const peer = getRequestIP(request);
                if (peer) {
                    setRequestIP(scoped, peer);
                }
                const response = await lease.context.handle(scoped);
                return retainResponseResource(response, lease.release, request.signal);
            } catch (error) {
                lease.release();
                throw error;
            }
        } catch (error) {
            this.logger.warn(
                "edge.context.unavailable",
                { hostname, requestId: requestId(request), ...this.contexts.snapshot() },
                error,
            );
            return refusal(503);
        }
    }
}
function refusal(status: number) {
    return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

function matchingAuthority(host: string, url: URL) {
    try {
        return /^[^\s/@?#\\]+$/u.test(host) && new URL(`${url.protocol}//${host}`).host === url.host;
    } catch {
        return false;
    }
}
