import { dispatchRequest } from "http-runner/core/request/dispatch";
import { setRequestIP } from "http-runner/core/request/ip";
import { requestId, runWithRequestContext, withRequestIdHeader } from "http-runner/core/request/observability";
import { finishRequestTiming, requestTimingCountSnapshot } from "http-runner/core/request/timing";
import type { Logger } from "@bernouy/logging";
import type { LogLevel } from "@bernouy/logging";
import type { Middleware, RouteHandler } from "http-runner/interfaces/Runner";
import { matchPath, normalizePath, pathUnderPrefix } from "./runnerPaths";

export type RegisteredRoute = {
    method: string;
    path: string;
    handler: RouteHandler;
    middlewares: Middleware[];
};

export type RegisteredDefaultEndpoint = {
    method: string;
    prefix: string;
    handler: RouteHandler;
    middlewares: Middleware[];
};

type RequestPeer = {
    requestIP(request: Request): { address: string } | null;
};

export async function dispatchBunRunnerRequest(
    request: Request,
    server: RequestPeer,
    routes: readonly RegisteredRoute[],
    defaultEndpoints: readonly RegisteredDefaultEndpoint[],
    globalMiddlewares: Middleware[],
    logger?: Logger,
): Promise<Response> {
    return runWithRequestContext(request, async () => {
        const peer = server.requestIP(request);
        if (peer) {
            setRequestIP(request, peer.address);
        }
        const pathname = normalizePath(new URL(request.url).pathname);
        const route = routes.find(
            (candidate) => candidate.method === request.method && matchPath(candidate.path, pathname),
        );
        const fallback = route
            ? null
            : (defaultEndpoints
                  .filter(
                      (candidate) => candidate.method === request.method && pathUnderPrefix(pathname, candidate.prefix),
                  )
                  .sort((left, right) => right.prefix.length - left.prefix.length)[0] ?? null);
        const target = route ?? fallback;
        const startedAt = performance.now();
        if (target) {
            const response = await dispatchRequest(request, target, globalMiddlewares, logger);
            logRequestCompletion(logger, request, pathname, response.status, startedAt);
            return response;
        }
        requestId(request);
        const response = withRequestIdHeader(request, new Response("Not Found", { status: 404 }));
        logRequestCompletion(logger, request, pathname, response.status, startedAt);
        return response;
    });
}

function logRequestCompletion(
    logger: Logger | undefined,
    request: Request,
    path: string,
    status: number,
    startedAt: number,
): void {
    const timings = finishRequestTiming(request);
    const timingCounts = requestTimingCountSnapshot(request);
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const attributes = {
        method: request.method,
        path,
        status,
        durationMs,
        ...(Object.keys(timings).length > 0 ? { timings, timingCounts } : {}),
    };
    logger?.log(requestCompletionLevel(status, durationMs), "http.request.completed", attributes);
}

export function requestCompletionLevel(status: number, durationMs: number): LogLevel {
    if (status >= 500) {
        return "error";
    }
    return durationMs >= 100 ? "info" : "debug";
}
