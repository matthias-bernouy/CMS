import type { Middleware, RouteHandler } from "http-runner/interfaces/Runner";
import {
    existingRequestCorrelationId,
    requestCorrelationId,
    withRequestCorrelationHeader,
} from "http-runner/core/request/observability";

export type RequestTarget = {
    handler: RouteHandler;
    middlewares: Middleware[];
};

export async function dispatchRequest(
    request: Request,
    target: RequestTarget,
    globalMiddlewares: Middleware[],
): Promise<Response> {
    requestCorrelationId(request);
    const middlewares = [...globalMiddlewares, ...target.middlewares];
    let index = 0;
    const next = async (req: Request): Promise<Response> => {
        if (index < middlewares.length) {
            const middleware = middlewares[index++]!;
            return middleware(req, () => next(req));
        }
        return target.handler(req);
    };

    try {
        return withRequestCorrelationHeader(request, await next(request));
    } catch (error) {
        reportUnhandledRequestError(request, error);
        const status = (error as { status?: unknown })?.status;
        if (typeof status === "number") {
            const message = error instanceof Error ? error.message : "Error";
            const publicCode = (error as { publicCode?: unknown })?.publicCode;
            return withRequestCorrelationHeader(
                request,
                new Response(
                    JSON.stringify({
                        error: message,
                        ...(typeof publicCode === "string" ? { code: publicCode } : {}),
                    }),
                    {
                        status,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        }
        return withRequestCorrelationHeader(request, new Response("Internal Server Error", { status: 500 }));
    }
}

function reportUnhandledRequestError(request: Request, error: unknown): void {
    try {
        console.error(
            JSON.stringify({
                scope: "http-runner",
                kind: "unhandled_request_error",
                correlationId: existingRequestCorrelationId(request),
                errorType: error instanceof Error ? error.name : "unknown",
            }),
        );
    } catch {
        // Diagnostics must never replace the generic error response.
    }
}
