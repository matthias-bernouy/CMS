/** Serve an immutable export on loopback, including CORS for fonts in sandboxed frames. */
export function serveExampleFiles(files: ReadonlyMap<string, Blob>) {
    return Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
            const pathname = new URL(request.url).pathname;
            const path = pathname === "/" ? "index.html" : pathname.slice(1);
            const file = files.get(path);
            if (!file || !["GET", "HEAD"].includes(request.method)) {
                return new Response(null, { status: 404 });
            }
            return new Response(request.method === "HEAD" ? null : file, {
                headers: {
                    "Content-Type": file.type,
                    "Access-Control-Allow-Origin": "*",
                    "X-Content-Type-Options": "nosniff",
                    "Cache-Control": "no-store",
                    "Content-Security-Policy":
                        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'self'",
                },
            });
        },
    });
}
