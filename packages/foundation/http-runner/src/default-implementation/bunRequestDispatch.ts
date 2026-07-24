import { dispatchRequest } from "http-runner/core/request/dispatch";
import { setRequestIP } from "http-runner/core/request/ip";
import { requestCorrelationId, withRequestCorrelationHeader } from "http-runner/core/request/observability";
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
): Promise<Response> {
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
              .filter((candidate) => candidate.method === request.method && pathUnderPrefix(pathname, candidate.prefix))
              .sort((left, right) => right.prefix.length - left.prefix.length)[0] ?? null);
    const target = route ?? fallback;
    if (target) {
        return dispatchRequest(request, target, globalMiddlewares);
    }
    requestCorrelationId(request);
    return withRequestCorrelationHeader(request, new Response("Not Found", { status: 404 }));
}
