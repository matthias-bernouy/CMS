import type { Middleware, RouteHandler } from "http-runner/interfaces/Runner";
import type { Logger } from "@bernouy/logging";
import { requestId, withRequestIdHeader } from "http-runner/core/request/observability";
import { publicHttpErrorDetails } from "http-runner/core/request/publicError";

export type RequestTarget = {
    handler: RouteHandler;
    middlewares: Middleware[];
};

export async function dispatchRequest(
    request: Request,
    target: RequestTarget,
    globalMiddlewares: Middleware[],
    logger?: Logger,
): Promise<Response> {
    requestId(request);
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
        return withRequestIdHeader(request, await next(request));
    } catch (error) {
        const status = httpErrorStatus(error);
        if (status !== undefined) {
            if (status >= 500) {
                reportRequestError(request, error, logger, status, true);
            }
            const publicError = publicHttpErrorDetails(error);
            return withRequestIdHeader(
                request,
                new Response(
                    JSON.stringify({
                        error: publicError?.message ?? genericMessage(status),
                        ...(publicError?.code ? { code: publicError.code } : {}),
                        ...(publicError?.field ? { field: publicError.field } : {}),
                    }),
                    {
                        status,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        }
        reportRequestError(request, error, logger, 500, false);
        return withRequestIdHeader(request, new Response("Internal Server Error", { status: 500 }));
    }
}

function httpErrorStatus(error: unknown): number | undefined {
    const status = (error as { status?: unknown } | null)?.status;
    return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
        ? status
        : undefined;
}

function genericMessage(status: number): string {
    return status >= 500 ? "Internal Server Error" : "Request failed";
}

function reportRequestError(
    request: Request,
    error: unknown,
    logger: Logger | undefined,
    status: number,
    expectedHttpError: boolean,
): void {
    try {
        const attributes = { method: request.method, path: new URL(request.url).pathname, status };
        if (expectedHttpError) {
            logger?.error("http.request.failed", attributes, error);
        } else {
            logger?.error("http.request.unhandled", attributes, error);
        }
    } catch {
        // Diagnostics must never replace the generic error response.
    }
}
