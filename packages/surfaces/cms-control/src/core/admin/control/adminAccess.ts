import { createAuthGuard, type Authentication } from "@bernouy/cms-auth";
import type { Middleware } from "@bernouy/http-runner";

export function createControlAccessGuard(basePath: string, auth: Authentication): Middleware {
    return createAuthGuard({ basePath, auth });
}

export function createAuthenticatedControlGuard(basePath: string, auth: Authentication): Middleware {
    return createAuthGuard({
        basePath,
        auth,
        onUnauthenticated: (req, context) =>
            new URL(req.url).pathname.startsWith(`${basePath}/api/`)
                ? new Response("Unauthorized", { status: 401 })
                : new Response(null, { status: 302, headers: { Location: context.loginUrl } }),
    });
}
