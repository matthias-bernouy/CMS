export function startVerifierHealthServer(port: number): Bun.Server<unknown> {
    return Bun.serve({
        port,
        hostname: "0.0.0.0",
        fetch(request) {
            return request.method === "GET" && new URL(request.url).pathname === "/ready"
                ? Response.json({ ready: true })
                : new Response(null, { status: 404 });
        },
    });
}
