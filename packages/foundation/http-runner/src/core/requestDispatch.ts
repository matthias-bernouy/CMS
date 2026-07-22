import type { Middleware, RouteHandler } from "http-runner/interfaces/Runner";

export type RequestTarget = {
    handler: RouteHandler;
    middlewares: Middleware[];
};

export async function dispatchRequest(
    request: Request,
    target: RequestTarget,
    globalMiddlewares: Middleware[],
): Promise<Response> {
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
        return await next(request);
    } catch (error) {
        console.error(error);
        const status = (error as { status?: unknown })?.status;
        if (typeof status === "number") {
            const message = error instanceof Error ? error.message : "Error";
            return new Response(JSON.stringify({ error: message }), {
                status,
                headers: { "Content-Type": "application/json" },
            });
        }
        return new Response("Internal Server Error", { status: 500 });
    }
}
