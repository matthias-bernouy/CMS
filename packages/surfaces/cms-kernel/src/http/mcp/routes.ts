import type { Runner } from "@bernouy/http-runner";

/** Register concrete routes: Runner middleware runs only after a route matches. */
export function mountCmsMcpRoutes(runner: Runner, handle: (request: Request) => Promise<Response | null>) {
    const endpoint = async (request: Request) => (await handle(request)) ?? new Response(null, { status: 404 });
    for (const path of [
        "/.cms/mcp",
        "/.cms/oauth/authorize",
        "/.cms/oauth/register",
        "/.cms/oauth/token",
        "/.cms/connections",
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/.cms/mcp",
        "/.well-known/oauth-authorization-server",
    ]) {
        for (const method of ["GET", "POST", "DELETE", "OPTIONS"] as const) {
            runner.addEndpoint(method, path, endpoint);
        }
    }
    runner.group("/.cms/mcp/uploads", (uploads) => {
        uploads.setDefaultEndpoint("PUT", endpoint);
    });
}
